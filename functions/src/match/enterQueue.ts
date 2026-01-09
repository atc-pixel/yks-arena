/**
 * matchEnterQueue Cloud Function
 * 
 * Skill-based matchmaking with 5D Euclidean distance.
 * - İlk 15 saniye: Sadece gerçek kullanıcılarla eşleş (match_queue)
 * - 15 saniye sonra: bot_pool'u da dahil et
 * - Test botları da match_queue'ya girer ve birbirleriyle eşleşebilir
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { nanoid } from "nanoid";
import { db, FieldValue, Timestamp } from "../utils/firestore";
import { ensureUserDoc } from "../users/ensure";
import { applyHourlyRefillTx } from "../users/energy";
import type { UserDoc } from "../users/types";
import type { QueueTicket, MatchDoc, UserCategoryStats } from "../shared/types";
import { strictParse, EnterQueueInputSchema } from "../shared/validation";
import { calculateEuclideanDistance, calculateUserVector, getDynamicThreshold } from "./matchmaking.utils";
import { ensureBotPool, replenishBot, BOT_POOL_COLLECTION_NAME, type BotPoolEntry } from "./botPool";

// ============================================================================
// CONSTANTS
// ============================================================================

import { BOT_INCLUSION_THRESHOLD_SECONDS } from "../shared/constants";

const MATCH_QUEUE_COLLECTION = "match_queue";
const MATCHES_COLLECTION = "matches";
const USERS_COLLECTION = "users";
const MAX_CANDIDATES_TO_CHECK = 50;

// ============================================================================
// TYPES
// ============================================================================

type MatchCandidate = {
  id: string;
  distance: number;
  skillVector: number[];
  isBot: boolean;
  botDifficulty?: number;
  source: "queue" | "bot_pool";
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export const matchEnterQueue = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  // Zod validation (forceBot artık yok)
  strictParse(EnterQueueInputSchema, req.data, "matchEnterQueue");

  await ensureUserDoc(uid);

  // Pre-TX: Ensure bot pool is healthy (fire-and-forget)
  ensureBotPool().catch((e) => console.error("[BotPool] Maintenance failed:", e));

  // ==================== MAIN TRANSACTION ====================
  const result = await db.runTransaction(async (tx) => {
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const userSnap = await tx.get(userRef);
    
    if (!userSnap.exists) {
      throw new HttpsError("internal", "User doc missing");
    }

    const userData = userSnap.data() as UserDoc & { categoryStats?: UserCategoryStats };
    
    // ========== STEP A: Energy & Gate Checks ==========
    const nowMs = Date.now();
    const { energyAfter: energy } = applyHourlyRefillTx({ 
      tx, 
      userRef, 
      userData, 
      nowMs 
    });

    const activeMatchCount = Number(userData.presence?.activeMatchCount ?? 0);

    if (energy <= 0) {
      throw new HttpsError("failed-precondition", "ENERGY_ZERO");
    }
    if (activeMatchCount >= energy) {
      throw new HttpsError("failed-precondition", "MATCH_LIMIT_REACHED");
    }

    // ========== STEP B: Calculate User Skill Vector ==========
    const currentUserVector = calculateUserVector({
      categoryStats: userData.categoryStats ?? null,
      trophies: userData.trophies ?? 0,
    });

    // ========== STEP C: Check if already in queue ==========
    const existingTicketRef = db.collection(MATCH_QUEUE_COLLECTION).doc(uid);
    const existingTicketSnap = await tx.get(existingTicketRef);
    
    const nowTimestamp = Timestamp.now();
    const nowSeconds = nowTimestamp.seconds;
    
    let ticketWaitSeconds = 0;
    
    if (existingTicketSnap.exists) {
      const ticket = existingTicketSnap.data() as QueueTicket;
      if (ticket.status === "WAITING") {
        // Kullanıcı zaten kuyrukta - bekleme süresini hesapla
        ticketWaitSeconds = nowSeconds - ticket.createdAt.seconds;
      }
    }

    // ========== STEP D: Search for Match ==========
    const queueRef = db.collection(MATCH_QUEUE_COLLECTION);
    const botPoolRef = db.collection(BOT_POOL_COLLECTION_NAME);
    
    // 1. Önce match_queue'da ara (gerçek kullanıcılar + test botları)
    const queueCandidatesSnap = await tx.get(
      queueRef.where("status", "==", "WAITING").limit(MAX_CANDIDATES_TO_CHECK)
    );

    // #region agent log H5
    fetch('http://127.0.0.1:7242/ingest/36a93515-5c69-4ba7-b207-97735e7b3a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enterQueue.ts:121',message:'Queue query result',data:{uid:uid.slice(0,15),queueSize:queueCandidatesSnap.size,ticketWaitSeconds,myVector:currentUserVector},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    const eligibleCandidates: MatchCandidate[] = [];

    // Queue adaylarını değerlendir
    for (const doc of queueCandidatesSnap.docs) {
      const candidate = doc.data() as QueueTicket;
      
      // Skip self
      if (doc.id === uid) continue;

      const distance = calculateEuclideanDistance(
        currentUserVector,
        candidate.skillVector
      );

      // Dynamic threshold kontrolü
      const candidateWaitSeconds = nowSeconds - candidate.createdAt.seconds;
      const threshold = getDynamicThreshold(candidateWaitSeconds);

      // #region agent log H2
      fetch('http://127.0.0.1:7242/ingest/36a93515-5c69-4ba7-b207-97735e7b3a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enterQueue.ts:140',message:'Candidate check',data:{uid:uid.slice(0,15),candidateId:doc.id.slice(0,15),distance:distance.toFixed(2),threshold,candidateWaitSeconds,passed:distance<=threshold},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion

      if (distance <= threshold) {
        eligibleCandidates.push({
          id: doc.id,
          distance,
          skillVector: candidate.skillVector,
          isBot: candidate.isBot ?? false,
          botDifficulty: candidate.botDifficulty,
          source: "queue",
        });
      }
    }

    // 2. Eğer 15 saniye geçtiyse ve hala eşleşme yoksa, bot_pool'u da dahil et
    const includeBotPool = ticketWaitSeconds >= BOT_INCLUSION_THRESHOLD_SECONDS;
    
    if (includeBotPool && eligibleCandidates.length === 0) {
      console.log(`[Matchmaking] ${uid} waited ${ticketWaitSeconds}s, including bot_pool`);
      
      const botPoolSnap = await tx.get(
        botPoolRef.where("status", "==", "AVAILABLE").limit(MAX_CANDIDATES_TO_CHECK)
      );

      for (const doc of botPoolSnap.docs) {
        const bot = doc.data() as BotPoolEntry;
        
        const distance = calculateEuclideanDistance(
          currentUserVector,
          bot.skillVector
        );

        // Bot pool'dan herhangi bir bot kabul (threshold yok)
        eligibleCandidates.push({
          id: doc.id,
          distance,
          skillVector: bot.skillVector,
          isBot: true,
          botDifficulty: bot.botDifficulty,
          source: "bot_pool",
        });
      }
    }

    // #region agent log H4
    fetch('http://127.0.0.1:7242/ingest/36a93515-5c69-4ba7-b207-97735e7b3a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enterQueue.ts:185',message:'Eligible candidates',data:{uid:uid.slice(0,15),eligibleCount:eligibleCandidates.length,includeBotPool,ticketWaitSeconds,candidates:eligibleCandidates.slice(0,3).map(c=>({id:c.id.slice(0,15),dist:c.distance.toFixed(2),src:c.source}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    // En yakın 5 arasından rastgele seç (contention azaltır)
    let bestMatch: MatchCandidate | null = null;
    if (eligibleCandidates.length > 0) {
      eligibleCandidates.sort((a, b) => a.distance - b.distance);
      const top5 = eligibleCandidates.slice(0, 5);
      const randomIndex = Math.floor(Math.random() * top5.length);
      bestMatch = top5[randomIndex];
    }

    // ========== STEP E: Execute Match or Queue ==========
    // #region agent log H1
    fetch('http://127.0.0.1:7242/ingest/36a93515-5c69-4ba7-b207-97735e7b3a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enterQueue.ts:200',message:'Match decision',data:{uid:uid.slice(0,15),hasMatch:!!bestMatch,matchId:bestMatch?.id?.slice(0,15)||null,matchSource:bestMatch?.source||null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion

    if (bestMatch) {
      // ✅ MATCH FOUND
      const matchId = nanoid(20);
      const matchRef = db.collection(MATCHES_COLLECTION).doc(matchId);

      // Determine player types
      const playerTypes: Record<string, "HUMAN" | "BOT"> = {
        [uid]: "HUMAN",
        [bestMatch.id]: bestMatch.isBot ? "BOT" : "HUMAN",
      };

      // Create match document
      const matchDoc: MatchDoc = {
        createdAt: nowTimestamp,
        status: "ACTIVE",
        mode: "RANDOM",
        players: [uid, bestMatch.id],
        playerTypes,
        turn: {
          currentUid: uid, // Queue entrant starts
          phase: "SPIN",
          challengeSymbol: null,
          streak: 0,
          activeQuestionId: null,
          usedQuestionIds: [],
          streakSymbol: null,
          questionIndex: 0,
        },
        stateByUid: {
          [uid]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
          [bestMatch.id]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
        },
      };

      tx.set(matchRef, matchDoc);

      // Mark opponent based on source
      if (bestMatch.source === "queue") {
        // Queue'daki rakibin ticket'ını MATCHED yap
        const opponentTicketRef = db.collection(MATCH_QUEUE_COLLECTION).doc(bestMatch.id);
      tx.update(opponentTicketRef, { status: "MATCHED" });
        
        // If opponent is human, increment their active match count
        if (!bestMatch.isBot) {
          const opponentRef = db.collection(USERS_COLLECTION).doc(bestMatch.id);
          tx.update(opponentRef, {
            "presence.activeMatchCount": FieldValue.increment(1),
          });
        }
      } else {
        // Bot pool'dan alındıysa, bot'u IN_USE yap
        const botRef = db.collection(BOT_POOL_COLLECTION_NAME).doc(bestMatch.id);
        tx.update(botRef, { status: "IN_USE" });
      }

      // Increment active match count for current user
      tx.update(userRef, {
        "presence.activeMatchCount": FieldValue.increment(1),
      });

      // Delete current user's queue ticket if exists
      if (existingTicketSnap.exists) {
        tx.delete(existingTicketRef);
      }

      const sourceInfo = bestMatch.source === "bot_pool" ? " (from bot_pool)" : "";
      console.log(`[Matchmaking] Match: ${matchId}, distance: ${bestMatch.distance.toFixed(2)}, opponent: ${bestMatch.isBot ? "BOT" : "HUMAN"}${sourceInfo}`);

      // If bot was consumed from pool, replenish async
      if (bestMatch.source === "bot_pool") {
        replenishBot().catch((e) => console.error("[BotPool] Replenish failed:", e));
      }

      return {
        status: "MATCHED" as const,
        matchId,
        opponentType: bestMatch.isBot ? ("BOT" as const) : ("HUMAN" as const),
      };
    } else {
      // ❌ NO MATCH - Add to queue or update existing ticket
      // #region agent log H3
      fetch('http://127.0.0.1:7242/ingest/36a93515-5c69-4ba7-b207-97735e7b3a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enterQueue.ts:260',message:'No match - queuing',data:{uid:uid.slice(0,15),existingTicket:existingTicketSnap.exists,ticketWaitSeconds,queueSize:queueCandidatesSnap.size},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion

      if (!existingTicketSnap.exists) {
        // İlk kez kuyruğa giriyor
        const ticket: QueueTicket = {
        uid,
        createdAt: nowTimestamp,
        status: "WAITING",
        skillVector: currentUserVector,
        isBot: false,
      };

      tx.set(existingTicketRef, ticket);
      console.log(`[Matchmaking] Queued: ${uid}, vector: [${currentUserVector.map(v => v.toFixed(0)).join(", ")}]`);
      } else {
        // Zaten kuyrukta, sadece skill vector'ı güncelle (değişmiş olabilir)
        tx.update(existingTicketRef, { skillVector: currentUserVector });
        console.log(`[Matchmaking] Still queued: ${uid}, waited ${ticketWaitSeconds}s`);
      }

      return {
        status: "QUEUED" as const,
        matchId: null,
        opponentType: null,
        waitSeconds: ticketWaitSeconds,
      };
    }
  });

  return result;
});
