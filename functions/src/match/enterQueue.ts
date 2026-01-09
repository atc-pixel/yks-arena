/**
 * matchEnterQueue Cloud Function
 * 
 * Skill-based matchmaking with 5D Euclidean distance.
 * - forceBot: true ise sadece botlarla eşleşir (30s timeout sonrası)
 * - Passive bot pool ile queue hiç boş kalmaz
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
import { ensureBotPool, replenishBot } from "./botPool";

// ============================================================================
// CONSTANTS
// ============================================================================

const MATCH_QUEUE_COLLECTION = "match_queue";
const MATCHES_COLLECTION = "matches";
const USERS_COLLECTION = "users";
const MAX_CANDIDATES_TO_CHECK = 50;

// ============================================================================
// TYPES
// ============================================================================

type MatchCandidate = QueueTicket & { id: string; distance: number };

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export const matchEnterQueue = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  // Zod validation
  const input = strictParse(EnterQueueInputSchema, req.data, "matchEnterQueue");
  const forceBot = input.forceBot ?? false;

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
    
    if (existingTicketSnap.exists) {
      const ticket = existingTicketSnap.data() as QueueTicket;
      if (ticket.status === "WAITING") {
        // Already in queue - just return current status
        return {
          status: "QUEUED" as const,
          matchId: null,
          opponentType: null,
        };
      }
    }

    // ========== STEP D: Search for Match ==========
    const queueRef = db.collection(MATCH_QUEUE_COLLECTION);
    
    // Query based on forceBot flag
    let candidatesQuery = queueRef.where("status", "==", "WAITING");
    if (forceBot) {
      // Only search bots when forced
      candidatesQuery = candidatesQuery.where("isBot", "==", true);
    }
    
    const candidatesSnap = await tx.get(
      candidatesQuery.limit(MAX_CANDIDATES_TO_CHECK)
    );

    let bestMatch: MatchCandidate | null = null;
    const nowTimestamp = Timestamp.now();
    const nowSeconds = nowTimestamp.seconds;

    for (const doc of candidatesSnap.docs) {
      const candidate = doc.data() as QueueTicket;
      
      // Skip self
      if (doc.id === uid) continue;

      // Calculate Euclidean distance
      const distance = calculateEuclideanDistance(
        currentUserVector,
        candidate.skillVector
      );

      // forceBot: herhangi bir bot kabul et (en yakını seç)
      // Normal: dynamic threshold uygula
      if (forceBot) {
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { ...candidate, id: doc.id, distance };
        }
      } else {
        // Calculate dynamic threshold for THIS candidate
        const candidateWaitSeconds = nowSeconds - candidate.createdAt.seconds;
        const threshold = getDynamicThreshold(candidateWaitSeconds);

        if (distance <= threshold) {
          if (!bestMatch || distance < bestMatch.distance) {
            bestMatch = { ...candidate, id: doc.id, distance };
          }
        }
      }
    }

    // ========== STEP E: Execute Match or Queue ==========
    if (bestMatch) {
      // ✅ MATCH FOUND
      const matchId = nanoid(20);
      const matchRef = db.collection(MATCHES_COLLECTION).doc(matchId);
      const opponentTicketRef = db.collection(MATCH_QUEUE_COLLECTION).doc(bestMatch.id);

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

      // Mark opponent's ticket as MATCHED
      tx.update(opponentTicketRef, { status: "MATCHED" });

      // Increment active match count for current user
      tx.update(userRef, {
        "presence.activeMatchCount": FieldValue.increment(1),
      });

      // If opponent is human, increment their active match count too
      if (!bestMatch.isBot) {
        const opponentRef = db.collection(USERS_COLLECTION).doc(bestMatch.id);
        tx.update(opponentRef, {
          "presence.activeMatchCount": FieldValue.increment(1),
        });
      }

      // Delete current user's queue ticket if exists
      if (existingTicketSnap.exists) {
        tx.delete(existingTicketRef);
      }

      console.log(`[Matchmaking] Match: ${matchId}, distance: ${bestMatch.distance.toFixed(2)}, opponent: ${bestMatch.isBot ? "BOT" : "HUMAN"}`);

      // If bot was consumed, replenish async (fire-and-forget)
      if (bestMatch.isBot) {
        replenishBot().catch((e) => console.error("[BotPool] Replenish failed:", e));
      }

      return {
        status: "MATCHED" as const,
        matchId,
        opponentType: bestMatch.isBot ? ("BOT" as const) : ("HUMAN" as const),
      };
    } else {
      // ❌ NO MATCH - Add to queue (only if not forceBot, because forceBot should always find a bot)
      if (forceBot) {
        // This shouldn't happen if bot pool is healthy
        throw new HttpsError("unavailable", "NO_BOTS_AVAILABLE");
      }

      const ticket: QueueTicket = {
        uid,
        createdAt: nowTimestamp,
        status: "WAITING",
        skillVector: currentUserVector,
        isBot: false,
      };

      tx.set(existingTicketRef, ticket);

      console.log(`[Matchmaking] Queued: ${uid}, vector: [${currentUserVector.map(v => v.toFixed(0)).join(", ")}]`);

      return {
        status: "QUEUED" as const,
        matchId: null,
        opponentType: null,
      };
    }
  });

  return result;
});

