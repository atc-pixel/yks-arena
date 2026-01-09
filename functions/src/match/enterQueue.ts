/**
 * matchEnterQueue Cloud Function
 * 
 * Simplified matchmaking (bucket + dominant signature).
 * Neden:
 * - Query maliyeti düşük (bucket+signature filter)
 * - Debug edilebilir
 * - En kritik nokta: matchId'yi iki tarafa atomik "teslim" eder (idempotent)
 *
 * Akış:
 * - İlk 15 saniye: match_queue içinden (insan + test bot) eşleş
 * - 15 saniye sonra: bot_pool fallback (passive bot)
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { nanoid } from "nanoid";
import { db, FieldValue, Timestamp } from "../utils/firestore";
import type { DocumentData, QuerySnapshot } from "firebase-admin/firestore";
import { ensureUserDoc } from "../users/ensure";
import { applyHourlyRefillTx } from "../users/energy";
import type { UserDoc } from "../users/types";
import type { QueueTicket, MatchDoc, UserCategoryStats } from "../shared/types";
import { strictParse, EnterQueueInputSchema } from "../shared/validation";
import { computeRatingBucketAndSignature } from "./matchmaking.utils";
import { ensureBotPool, replenishBot, BOT_POOL_COLLECTION_NAME, type BotPoolEntry } from "./botPool";

// ============================================================================
// CONSTANTS
// ============================================================================

import { BOT_INCLUSION_THRESHOLD_SECONDS, MATCH_ADJACENT_BUCKET_WAIT_SECONDS } from "../shared/constants";

const MATCH_QUEUE_COLLECTION = "match_queue";
const MATCHES_COLLECTION = "matches";
const USERS_COLLECTION = "users";
const CANDIDATE_LIMIT = 5;

// ============================================================================
// TYPES
// ============================================================================

type QueueCandidate = {
  uid: string;
  isBot: boolean;
  source: "queue" | "bot_pool";
  botDifficulty?: number;
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

    // ========== STEP B: Rating + Signature ==========
    const ratingInfo = computeRatingBucketAndSignature({
      categoryStats: userData.categoryStats ?? null,
      trophies: userData.trophies ?? 0,
    });

    // ========== STEP C: Check if already in queue ==========
    const existingTicketRef = db.collection(MATCH_QUEUE_COLLECTION).doc(uid);
    const existingTicketSnap = await tx.get(existingTicketRef);
    
    const nowTimestamp = Timestamp.now();
    const nowSeconds = nowTimestamp.seconds;
    
    // Fast-path: already matched -> return matchId (idempotent)
    if (existingTicketSnap.exists) {
      const ticket = existingTicketSnap.data() as QueueTicket;
      if (ticket.status === "MATCHED" && ticket.matchId) {
        // Cleanup: ticket artık gerekli değil (match doc source of truth)
        tx.delete(existingTicketRef);
        return {
          status: "MATCHED" as const,
          matchId: ticket.matchId,
          opponentType: null,
        };
      }
    }

    // Ensure / refresh ticket as WAITING (rating değişmiş olabilir)
    if (!existingTicketSnap.exists) {
      const ticket: QueueTicket = {
        uid,
        createdAt: nowTimestamp,
        status: "WAITING",
        rating: ratingInfo.rating,
        bucket: ratingInfo.bucket,
        signature: ratingInfo.signature,
        isBot: false,
      };
      tx.set(existingTicketRef, ticket);
    } else {
      tx.update(existingTicketRef, {
        status: "WAITING",
        rating: ratingInfo.rating,
        bucket: ratingInfo.bucket,
        signature: ratingInfo.signature,
        claimedAt: FieldValue.delete(),
        claimedBy: FieldValue.delete(),
        matchId: FieldValue.delete(),
      });
    }

    const createdAtSeconds = existingTicketSnap.exists
      ? (existingTicketSnap.data() as QueueTicket).createdAt.seconds
      : nowSeconds;
    const ticketWaitSeconds = Math.max(0, nowSeconds - createdAtSeconds);

    // ========== STEP D: Search + Claim Candidate ==========
    const queueRef = db.collection(MATCH_QUEUE_COLLECTION);
    const botPoolRef = db.collection(BOT_POOL_COLLECTION_NAME);

    const tryClaimFromSnap = (snap: QuerySnapshot<DocumentData>): QueueCandidate | null => {
      for (const doc of snap.docs) {
        if (doc.id === uid) continue;
        const data = doc.data() as QueueTicket;
        if (data.status !== "WAITING") continue;
        if (data.claimedAt) continue;

        tx.update(doc.ref, { claimedAt: nowTimestamp, claimedBy: uid });
        return { uid: doc.id, isBot: data.isBot ?? false, botDifficulty: data.botDifficulty, source: "queue" };
      }
      return null;
    };

    // 1) Strict: same bucket + same signature
    const strictSnap = await tx.get(
      queueRef
        .where("status", "==", "WAITING")
        .where("bucket", "==", ratingInfo.bucket)
        .where("signature", "==", ratingInfo.signature)
        .orderBy("createdAt", "asc")
        .limit(CANDIDATE_LIMIT)
    );
    let opponent: QueueCandidate | null = tryClaimFromSnap(strictSnap);

    // 2) Relax: same bucket (signature ignore)
    if (!opponent) {
      const bucketSnap = await tx.get(
        queueRef
          .where("status", "==", "WAITING")
          .where("bucket", "==", ratingInfo.bucket)
          .orderBy("createdAt", "asc")
          .limit(CANDIDATE_LIMIT)
      );
      opponent = tryClaimFromSnap(bucketSnap);
    }

    // 3) Expand: adjacent bucket after some wait
    if (!opponent && ticketWaitSeconds >= MATCH_ADJACENT_BUCKET_WAIT_SECONDS) {
      const lowerSnap = await tx.get(
        queueRef
          .where("status", "==", "WAITING")
          .where("bucket", "==", ratingInfo.bucket - 1)
          .orderBy("createdAt", "asc")
          .limit(CANDIDATE_LIMIT)
      );
      opponent = tryClaimFromSnap(lowerSnap);

      if (!opponent) {
        const upperSnap = await tx.get(
          queueRef
            .where("status", "==", "WAITING")
            .where("bucket", "==", ratingInfo.bucket + 1)
            .orderBy("createdAt", "asc")
            .limit(CANDIDATE_LIMIT)
        );
        opponent = tryClaimFromSnap(upperSnap);
      }
    }

    // 4) Bot fallback: after threshold
    if (!opponent && ticketWaitSeconds >= BOT_INCLUSION_THRESHOLD_SECONDS) {
      const botSnap = await tx.get(
        botPoolRef.where("status", "==", "AVAILABLE").limit(1)
      );
      const botDoc = botSnap.docs[0];
      if (botDoc) {
        const bot = botDoc.data() as BotPoolEntry;
        tx.update(botDoc.ref, { status: "IN_USE" });
        opponent = { uid: botDoc.id, isBot: true, botDifficulty: bot.botDifficulty, source: "bot_pool" };
      }
    }

    // ========== STEP E: Execute Match or Stay Queued ==========
    if (opponent) {
      // ✅ MATCH FOUND
      const matchId = nanoid(20);
      const matchRef = db.collection(MATCHES_COLLECTION).doc(matchId);

      // Determine player types
      const playerTypes: Record<string, "HUMAN" | "BOT"> = {
        [uid]: "HUMAN",
        [opponent.uid]: opponent.isBot ? "BOT" : "HUMAN",
      };

      // Create match document
      const matchDoc: MatchDoc = {
        createdAt: nowTimestamp,
        status: "ACTIVE",
        mode: "RANDOM",
        players: [uid, opponent.uid],
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
          [opponent.uid]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
        },
      };

      tx.set(matchRef, matchDoc);

      // Mark opponent (ticket → MATCHED with matchId)
      if (opponent.source === "queue") {
        const opponentTicketRef = db.collection(MATCH_QUEUE_COLLECTION).doc(opponent.uid);
        tx.update(opponentTicketRef, { status: "MATCHED", matchId });

        // If opponent is human, increment their active match count
        if (!opponent.isBot) {
          const opponentRef = db.collection(USERS_COLLECTION).doc(opponent.uid);
          tx.update(opponentRef, {
            "presence.activeMatchCount": FieldValue.increment(1),
          });
        }
      }

      // Increment active match count for current user
      tx.update(userRef, {
        "presence.activeMatchCount": FieldValue.increment(1),
      });

      // Set current user's ticket as MATCHED with matchId (idempotent delivery)
      tx.set(existingTicketRef, {
        uid,
        createdAt: nowTimestamp,
        status: "MATCHED",
        rating: ratingInfo.rating,
        bucket: ratingInfo.bucket,
        signature: ratingInfo.signature,
        isBot: false,
        matchId,
      } satisfies QueueTicket);

      const sourceInfo = opponent.source === "bot_pool" ? " (from bot_pool)" : "";
      console.log(
        `[Matchmaking] Match: ${matchId}, bucket=${ratingInfo.bucket}, sig=${ratingInfo.signature}, opponent=${opponent.isBot ? "BOT" : "HUMAN"}${sourceInfo}`
      );

      // If bot was consumed from pool, replenish async
      if (opponent.source === "bot_pool") {
        replenishBot().catch((e) => console.error("[BotPool] Replenish failed:", e));
      }

      return {
        status: "MATCHED" as const,
        matchId,
        opponentType: opponent.isBot ? ("BOT" as const) : ("HUMAN" as const),
      };
    } else {
      // ❌ NO MATCH - Add to queue or update existing ticket
      console.log(`[Matchmaking] Still queued: ${uid}, waited ${ticketWaitSeconds}s, bucket=${ratingInfo.bucket}, sig=${ratingInfo.signature}`);

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
