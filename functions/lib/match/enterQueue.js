"use strict";
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
const constants_1 = require("../shared/constants");
const MATCH_QUEUE_COLLECTION = "match_queue";
const MATCHES_COLLECTION = "matches";
const USERS_COLLECTION = "users";
const CANDIDATE_LIMIT = 5;
// ============================================================================
// MAIN FUNCTION
// ============================================================================
exports.matchEnterQueue = (0, https_1.onCall)(async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    // Zod validation (forceBot artık yok)
    (0, validation_1.strictParse)(validation_1.EnterQueueInputSchema, req.data, "matchEnterQueue");
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
        // ========== STEP B: Rating + Signature ==========
        const ratingInfo = (0, matchmaking_utils_1.computeRatingBucketAndSignature)({
            categoryStats: userData.categoryStats ?? null,
            trophies: userData.trophies ?? 0,
        });
        // ========== STEP C: Check if already in queue ==========
        const existingTicketRef = firestore_1.db.collection(MATCH_QUEUE_COLLECTION).doc(uid);
        const existingTicketSnap = await tx.get(existingTicketRef);
        const nowTimestamp = firestore_1.Timestamp.now();
        const nowSeconds = nowTimestamp.seconds;
        // Fast-path: already matched -> return matchId (idempotent)
        if (existingTicketSnap.exists) {
            const ticket = existingTicketSnap.data();
            if (ticket.status === "MATCHED" && ticket.matchId) {
                // Cleanup: ticket artık gerekli değil (match doc source of truth)
                tx.delete(existingTicketRef);
                return {
                    status: "MATCHED",
                    matchId: ticket.matchId,
                    opponentType: null,
                };
            }
        }
        // Ensure / refresh ticket as WAITING (rating değişmiş olabilir)
        if (!existingTicketSnap.exists) {
            const ticket = {
                uid,
                createdAt: nowTimestamp,
                status: "WAITING",
                rating: ratingInfo.rating,
                bucket: ratingInfo.bucket,
                signature: ratingInfo.signature,
                isBot: false,
            };
            tx.set(existingTicketRef, ticket);
        }
        else {
            tx.update(existingTicketRef, {
                status: "WAITING",
                rating: ratingInfo.rating,
                bucket: ratingInfo.bucket,
                signature: ratingInfo.signature,
                claimedAt: firestore_1.FieldValue.delete(),
                claimedBy: firestore_1.FieldValue.delete(),
                matchId: firestore_1.FieldValue.delete(),
            });
        }
        const createdAtSeconds = existingTicketSnap.exists
            ? existingTicketSnap.data().createdAt.seconds
            : nowSeconds;
        const ticketWaitSeconds = Math.max(0, nowSeconds - createdAtSeconds);
        // ========== STEP D: Search + Claim Candidate ==========
        const queueRef = firestore_1.db.collection(MATCH_QUEUE_COLLECTION);
        const botPoolRef = firestore_1.db.collection(botPool_1.BOT_POOL_COLLECTION_NAME);
        const tryClaimFromSnap = (snap) => {
            for (const doc of snap.docs) {
                if (doc.id === uid)
                    continue;
                const data = doc.data();
                if (data.status !== "WAITING")
                    continue;
                if (data.claimedAt)
                    continue;
                tx.update(doc.ref, { claimedAt: nowTimestamp, claimedBy: uid });
                return { uid: doc.id, isBot: data.isBot ?? false, botDifficulty: data.botDifficulty, source: "queue" };
            }
            return null;
        };
        // 1) Strict: same bucket + same signature
        const strictSnap = await tx.get(queueRef
            .where("status", "==", "WAITING")
            .where("bucket", "==", ratingInfo.bucket)
            .where("signature", "==", ratingInfo.signature)
            .orderBy("createdAt", "asc")
            .limit(CANDIDATE_LIMIT));
        let opponent = tryClaimFromSnap(strictSnap);
        // 2) Relax: same bucket (signature ignore)
        if (!opponent) {
            const bucketSnap = await tx.get(queueRef
                .where("status", "==", "WAITING")
                .where("bucket", "==", ratingInfo.bucket)
                .orderBy("createdAt", "asc")
                .limit(CANDIDATE_LIMIT));
            opponent = tryClaimFromSnap(bucketSnap);
        }
        // 3) Expand: adjacent bucket after some wait
        if (!opponent && ticketWaitSeconds >= constants_1.MATCH_ADJACENT_BUCKET_WAIT_SECONDS) {
            const lowerSnap = await tx.get(queueRef
                .where("status", "==", "WAITING")
                .where("bucket", "==", ratingInfo.bucket - 1)
                .orderBy("createdAt", "asc")
                .limit(CANDIDATE_LIMIT));
            opponent = tryClaimFromSnap(lowerSnap);
            if (!opponent) {
                const upperSnap = await tx.get(queueRef
                    .where("status", "==", "WAITING")
                    .where("bucket", "==", ratingInfo.bucket + 1)
                    .orderBy("createdAt", "asc")
                    .limit(CANDIDATE_LIMIT));
                opponent = tryClaimFromSnap(upperSnap);
            }
        }
        // 4) Bot fallback: after threshold
        if (!opponent && ticketWaitSeconds >= constants_1.BOT_INCLUSION_THRESHOLD_SECONDS) {
            const botSnap = await tx.get(botPoolRef.where("status", "==", "AVAILABLE").limit(1));
            const botDoc = botSnap.docs[0];
            if (botDoc) {
                const bot = botDoc.data();
                tx.update(botDoc.ref, { status: "IN_USE" });
                opponent = { uid: botDoc.id, isBot: true, botDifficulty: bot.botDifficulty, source: "bot_pool" };
            }
        }
        // ========== STEP E: Execute Match or Stay Queued ==========
        if (opponent) {
            // ✅ MATCH FOUND
            const matchId = (0, nanoid_1.nanoid)(20);
            const matchRef = firestore_1.db.collection(MATCHES_COLLECTION).doc(matchId);
            // Determine player types
            const playerTypes = {
                [uid]: "HUMAN",
                [opponent.uid]: opponent.isBot ? "BOT" : "HUMAN",
            };
            // Create match document
            const matchDoc = {
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
                const opponentTicketRef = firestore_1.db.collection(MATCH_QUEUE_COLLECTION).doc(opponent.uid);
                tx.update(opponentTicketRef, { status: "MATCHED", matchId });
                // If opponent is human, increment their active match count
                if (!opponent.isBot) {
                    const opponentRef = firestore_1.db.collection(USERS_COLLECTION).doc(opponent.uid);
                    tx.update(opponentRef, {
                        "presence.activeMatchCount": firestore_1.FieldValue.increment(1),
                    });
                }
            }
            // Increment active match count for current user
            tx.update(userRef, {
                "presence.activeMatchCount": firestore_1.FieldValue.increment(1),
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
            });
            const sourceInfo = opponent.source === "bot_pool" ? " (from bot_pool)" : "";
            console.log(`[Matchmaking] Match: ${matchId}, bucket=${ratingInfo.bucket}, sig=${ratingInfo.signature}, opponent=${opponent.isBot ? "BOT" : "HUMAN"}${sourceInfo}`);
            // If bot was consumed from pool, replenish async
            if (opponent.source === "bot_pool") {
                (0, botPool_1.replenishBot)().catch((e) => console.error("[BotPool] Replenish failed:", e));
            }
            return {
                status: "MATCHED",
                matchId,
                opponentType: opponent.isBot ? "BOT" : "HUMAN",
            };
        }
        else {
            // ❌ NO MATCH - Add to queue or update existing ticket
            console.log(`[Matchmaking] Still queued: ${uid}, waited ${ticketWaitSeconds}s, bucket=${ratingInfo.bucket}, sig=${ratingInfo.signature}`);
            return {
                status: "QUEUED",
                matchId: null,
                opponentType: null,
                waitSeconds: ticketWaitSeconds,
            };
        }
    });
    return result;
});
