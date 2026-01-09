"use strict";
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
const constants_1 = require("../shared/constants");
const MATCH_QUEUE_COLLECTION = "match_queue";
const MATCHES_COLLECTION = "matches";
const USERS_COLLECTION = "users";
exports.matchEnterQueue = (0, https_1.onCall)(async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    (0, validation_1.strictParse)(validation_1.EnterQueueInputSchema, req.data, "matchEnterQueue");
    await (0, ensure_1.ensureUserDoc)(uid);
    // Bot havuzu bakımı (fire-and-forget)
    (0, botPool_1.ensureBotPool)().catch((e) => console.error("[BotPool] Maintenance failed:", e));
    const result = await firestore_1.db.runTransaction(async (tx) => {
        const userRef = firestore_1.db.collection(USERS_COLLECTION).doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists)
            throw new https_1.HttpsError("internal", "User doc missing");
        const userData = userSnap.data();
        const nowMs = Date.now();
        // Enerji kontrolü
        const { energyAfter: energy } = (0, energy_1.applyHourlyRefillTx)({ tx, userRef, userData, nowMs });
        if (energy <= 0)
            throw new https_1.HttpsError("failed-precondition", "ENERGY_ZERO");
        const currentTrophies = userData.trophies ?? 0;
        const currentUserVector = (0, matchmaking_utils_1.calculateUserVector)({
            categoryStats: userData.categoryStats ?? null,
            trophies: currentTrophies,
        });
        // Kuyruk bileti kontrolü
        const ticketRef = firestore_1.db.collection(MATCH_QUEUE_COLLECTION).doc(uid);
        const ticketSnap = await tx.get(ticketRef);
        let waitSeconds = 0;
        const nowTimestamp = firestore_1.Timestamp.now();
        if (ticketSnap.exists) {
            const ticketData = ticketSnap.data();
            waitSeconds = nowTimestamp.seconds - ticketData.createdAt.seconds;
        }
        // Aday Arama
        const queueCandidatesSnap = await tx.get(firestore_1.db.collection(MATCH_QUEUE_COLLECTION)
            .where("status", "==", "WAITING")
            .limit(10));
        let bestMatch = null;
        let minDistance = Infinity;
        // Adayları tara
        queueCandidatesSnap.docs.forEach(doc => {
            if (doc.id === uid)
                return;
            const candidate = doc.data();
            // HATA BURADAYDI: skillVector'ın varlığını garantiye alıyoruz
            const distance = (0, matchmaking_utils_1.calculateEuclideanDistance)(currentUserVector, candidate.skillVector);
            const threshold = (0, matchmaking_utils_1.getDynamicThreshold)(waitSeconds);
            if (distance <= threshold && distance < minDistance) {
                minDistance = distance;
                bestMatch = { id: doc.id, ...candidate, source: "queue" };
            }
        });
        // Rakip bulunamadıysa BOT_POOL
        if (!bestMatch && waitSeconds >= constants_1.BOT_INCLUSION_THRESHOLD_SECONDS) {
            const botPoolSnap = await tx.get(firestore_1.db.collection(botPool_1.BOT_POOL_COLLECTION_NAME)
                .where("status", "==", "AVAILABLE")
                .limit(1));
            if (!botPoolSnap.empty) {
                const botDoc = botPoolSnap.docs[0];
                const botData = botDoc.data();
                bestMatch = { id: botDoc.id, ...botData, isBot: true, source: "bot_pool" };
            }
        }
        if (bestMatch) {
            const matchId = (0, nanoid_1.nanoid)(20);
            const matchRef = firestore_1.db.collection(MATCHES_COLLECTION).doc(matchId);
            const matchDoc = {
                createdAt: nowTimestamp,
                status: "ACTIVE",
                mode: "RANDOM",
                players: [uid, bestMatch.id],
                playerTypes: { [uid]: "HUMAN", [bestMatch.id]: bestMatch.isBot ? "BOT" : "HUMAN" },
                turn: { currentUid: uid, phase: "SPIN", challengeSymbol: null, streak: 0, activeQuestionId: null, usedQuestionIds: [], streakSymbol: null, questionIndex: 0 },
                stateByUid: {
                    [uid]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
                    [bestMatch.id]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
                },
            };
            tx.set(matchRef, matchDoc);
            tx.update(userRef, { "presence.activeMatchCount": firestore_1.FieldValue.increment(1) });
            if (bestMatch.source === "queue") {
                tx.update(firestore_1.db.collection(MATCH_QUEUE_COLLECTION).doc(bestMatch.id), { status: "MATCHED" });
                if (!bestMatch.isBot) {
                    tx.update(firestore_1.db.collection(USERS_COLLECTION).doc(bestMatch.id), { "presence.activeMatchCount": firestore_1.FieldValue.increment(1) });
                }
            }
            else {
                tx.update(firestore_1.db.collection(botPool_1.BOT_POOL_COLLECTION_NAME).doc(bestMatch.id), { status: "IN_USE" });
                (0, botPool_1.replenishBot)().catch(() => { });
            }
            tx.delete(ticketRef);
            return { status: "MATCHED", matchId, opponentType: bestMatch.isBot ? "BOT" : "HUMAN" };
        }
        // KUYRUĞA EKLE
        const newTicket = {
            uid,
            createdAt: ticketSnap.exists ? ticketSnap.data().createdAt : nowTimestamp,
            status: "WAITING",
            skillVector: currentUserVector,
            isBot: false,
        };
        tx.set(ticketRef, newTicket);
        return { status: "QUEUED", matchId: null, opponentType: null, waitSeconds };
    });
    return result;
});
