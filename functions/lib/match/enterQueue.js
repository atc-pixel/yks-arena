"use strict";
/**
 * matchEnterQueue Cloud Function
 *
 * Skill-based matchmaking with 5D Euclidean distance.
 * - forceBot: true ise sadece botlarla eşleşir (30s timeout sonrası)
 * - Passive bot pool ile queue hiç boş kalmaz
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchEnterQueue = void 0;
const https_1 = require("firebase-functions/v2/https");
const nanoid_1 = require("nanoid");
const firestore_1 = require("../utils/firestore");
const ensure_1 = require("../users/ensure");
const energy_1 = require("../users/energy");
const validation_1 = require("../shared/validation");
const matchmaking_utils_1 = require("./matchmaking.utils");
const botPool_1 = require("./botPool");
// ============================================================================
// CONSTANTS
// ============================================================================
const MATCH_QUEUE_COLLECTION = "match_queue";
const MATCHES_COLLECTION = "matches";
const USERS_COLLECTION = "users";
const MAX_CANDIDATES_TO_CHECK = 50;
// ============================================================================
// MAIN FUNCTION
// ============================================================================
exports.matchEnterQueue = (0, https_1.onCall)(async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    // Zod validation
    const input = (0, validation_1.strictParse)(validation_1.EnterQueueInputSchema, req.data, "matchEnterQueue");
    const forceBot = input.forceBot ?? false;
    await (0, ensure_1.ensureUserDoc)(uid);
    // Pre-TX: Ensure bot pool is healthy (fire-and-forget)
    (0, botPool_1.ensureBotPool)().catch((e) => console.error("[BotPool] Maintenance failed:", e));
    // ==================== MAIN TRANSACTION ====================
    const result = await firestore_1.db.runTransaction(async (tx) => {
        const userRef = firestore_1.db.collection(USERS_COLLECTION).doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
            throw new https_1.HttpsError("internal", "User doc missing");
        }
        const userData = userSnap.data();
        // ========== STEP A: Energy & Gate Checks ==========
        const nowMs = Date.now();
        const { energyAfter: energy } = (0, energy_1.applyHourlyRefillTx)({
            tx,
            userRef,
            userData,
            nowMs
        });
        const activeMatchCount = Number(userData.presence?.activeMatchCount ?? 0);
        if (energy <= 0) {
            throw new https_1.HttpsError("failed-precondition", "ENERGY_ZERO");
        }
        if (activeMatchCount >= energy) {
            throw new https_1.HttpsError("failed-precondition", "MATCH_LIMIT_REACHED");
        }
        // ========== STEP B: Calculate User Skill Vector ==========
        const currentUserVector = (0, matchmaking_utils_1.calculateUserVector)({
            categoryStats: userData.categoryStats ?? null,
            trophies: userData.trophies ?? 0,
        });
        // ========== STEP C: Check if already in queue ==========
        const existingTicketRef = firestore_1.db.collection(MATCH_QUEUE_COLLECTION).doc(uid);
        const existingTicketSnap = await tx.get(existingTicketRef);
        if (existingTicketSnap.exists) {
            const ticket = existingTicketSnap.data();
            if (ticket.status === "WAITING") {
                // Already in queue - just return current status
                return {
                    status: "QUEUED",
                    matchId: null,
                    opponentType: null,
                };
            }
        }
        // ========== STEP D: Search for Match ==========
        const queueRef = firestore_1.db.collection(MATCH_QUEUE_COLLECTION);
        // Query based on forceBot flag
        let candidatesQuery = queueRef.where("status", "==", "WAITING");
        if (forceBot) {
            // Only search bots when forced
            candidatesQuery = candidatesQuery.where("isBot", "==", true);
        }
        const candidatesSnap = await tx.get(candidatesQuery.limit(MAX_CANDIDATES_TO_CHECK));
        let bestMatch = null;
        const nowTimestamp = firestore_1.Timestamp.now();
        const nowSeconds = nowTimestamp.seconds;
        for (const doc of candidatesSnap.docs) {
            const candidate = doc.data();
            // Skip self
            if (doc.id === uid)
                continue;
            // Calculate Euclidean distance
            const distance = (0, matchmaking_utils_1.calculateEuclideanDistance)(currentUserVector, candidate.skillVector);
            // forceBot: herhangi bir bot kabul et (en yakını seç)
            // Normal: dynamic threshold uygula
            if (forceBot) {
                if (!bestMatch || distance < bestMatch.distance) {
                    bestMatch = { ...candidate, id: doc.id, distance };
                }
            }
            else {
                // Calculate dynamic threshold for THIS candidate
                const candidateWaitSeconds = nowSeconds - candidate.createdAt.seconds;
                const threshold = (0, matchmaking_utils_1.getDynamicThreshold)(candidateWaitSeconds);
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
            const matchId = (0, nanoid_1.nanoid)(20);
            const matchRef = firestore_1.db.collection(MATCHES_COLLECTION).doc(matchId);
            const opponentTicketRef = firestore_1.db.collection(MATCH_QUEUE_COLLECTION).doc(bestMatch.id);
            // Determine player types
            const playerTypes = {
                [uid]: "HUMAN",
                [bestMatch.id]: bestMatch.isBot ? "BOT" : "HUMAN",
            };
            // Create match document
            const matchDoc = {
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
                "presence.activeMatchCount": firestore_1.FieldValue.increment(1),
            });
            // If opponent is human, increment their active match count too
            if (!bestMatch.isBot) {
                const opponentRef = firestore_1.db.collection(USERS_COLLECTION).doc(bestMatch.id);
                tx.update(opponentRef, {
                    "presence.activeMatchCount": firestore_1.FieldValue.increment(1),
                });
            }
            // Delete current user's queue ticket if exists
            if (existingTicketSnap.exists) {
                tx.delete(existingTicketRef);
            }
            console.log(`[Matchmaking] Match: ${matchId}, distance: ${bestMatch.distance.toFixed(2)}, opponent: ${bestMatch.isBot ? "BOT" : "HUMAN"}`);
            // If bot was consumed, replenish async (fire-and-forget)
            if (bestMatch.isBot) {
                (0, botPool_1.replenishBot)().catch((e) => console.error("[BotPool] Replenish failed:", e));
            }
            return {
                status: "MATCHED",
                matchId,
                opponentType: bestMatch.isBot ? "BOT" : "HUMAN",
            };
        }
        else {
            // ❌ NO MATCH - Add to queue (only if not forceBot, because forceBot should always find a bot)
            if (forceBot) {
                // This shouldn't happen if bot pool is healthy
                throw new https_1.HttpsError("unavailable", "NO_BOTS_AVAILABLE");
            }
            const ticket = {
                uid,
                createdAt: nowTimestamp,
                status: "WAITING",
                skillVector: currentUserVector,
                isBot: false,
            };
            tx.set(existingTicketRef, ticket);
            console.log(`[Matchmaking] Queued: ${uid}, vector: [${currentUserVector.map(v => v.toFixed(0)).join(", ")}]`);
            return {
                status: "QUEUED",
                matchId: null,
                opponentType: null,
            };
        }
    });
    return result;
});
