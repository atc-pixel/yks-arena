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
const BOT_POOL_CANDIDATE_LIMIT = 12;
exports.matchEnterQueue = (0, https_1.onCall)({ region: constants_1.FUNCTIONS_REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    let category;
    ({ category } = (0, validation_1.strictParse)(validation_1.EnterQueueInputSchema, req.data, "matchEnterQueue"));
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
        // Firestore TX rule: ALL reads must happen before ANY writes.
        // Read ticket + candidates BEFORE applyHourlyRefillTx (writes).
        const ticketRef = firestore_1.db.collection(MATCH_QUEUE_COLLECTION).doc(uid);
        const ticketSnap = await tx.get(ticketRef);
        const queueCandidatesSnap = await tx.get(firestore_1.db.collection(MATCH_QUEUE_COLLECTION)
            .where("status", "==", "WAITING")
            .limit(10));
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
        let waitSeconds = 0;
        const nowTimestamp = firestore_1.Timestamp.now();
        if (ticketSnap.exists) {
            const ticketData = ticketSnap.data();
            // Idempotency: Eğer bu kullanıcı başka bir TX tarafından match edildi ise,
            // ikinci bir match yaratma (özellikle bot fallback) yerine mevcut match'e yönlendir.
            if (ticketData.status === "MATCHED" && typeof ticketData.matchedMatchId === "string" && ticketData.matchedMatchId) {
                tx.delete(ticketRef);
                return { status: "MATCHED", matchId: ticketData.matchedMatchId, opponentType: null };
            }
            waitSeconds = nowTimestamp.seconds - ticketData.createdAt.seconds;
        }
        // Aday Arama
        let bestMatch = null;
        let minDistance = Infinity;
        // Adayları tara (kategori eşleşmesi kontrolü)
        // Not: forEach callback'i TS control-flow tarafından analiz edilmediği için burada for..of kullanıyoruz.
        for (const doc of queueCandidatesSnap.docs) {
            if (doc.id === uid)
                continue;
            const candidate = doc.data();
            // Kategori eşleşmesi kontrolü (aynı kategori olmalı)
            if (candidate.category !== category)
                continue;
            // HATA BURADAYDI: skillVector'ın varlığını garantiye alıyoruz
            const distance = (0, matchmaking_utils_1.calculateEuclideanDistance)(currentUserVector, candidate.skillVector);
            const threshold = (0, matchmaking_utils_1.getDynamicThreshold)(waitSeconds);
            if (distance <= threshold && distance < minDistance) {
                minDistance = distance;
                bestMatch = { id: doc.id, ...candidate, source: "queue" };
            }
        }
        // Rakip bulunamadıysa BOT_POOL
        if (!bestMatch && waitSeconds >= constants_1.BOT_INCLUSION_THRESHOLD_SECONDS) {
            console.log(`[Matchmaking] Bot inclusion window reached (waitSeconds=${waitSeconds}, threshold=${constants_1.BOT_INCLUSION_THRESHOLD_SECONDS})`);
            const botPoolSnap = await tx.get(firestore_1.db.collection(botPool_1.BOT_POOL_COLLECTION_NAME)
                .where("status", "==", "AVAILABLE")
                .limit(BOT_POOL_CANDIDATE_LIMIT));
            if (!botPoolSnap.empty) {
                console.log(`[Matchmaking] Bot pool candidates: ${botPoolSnap.size}`);
                // En uygun bot = en küçük skillVector mesafesi
                let bestBotDoc = null;
                let bestBotData = null;
                let bestBotDistance = Infinity;
                for (const botDoc of botPoolSnap.docs) {
                    const botData = botDoc.data();
                    const dist = (0, matchmaking_utils_1.calculateEuclideanDistance)(currentUserVector, botData.skillVector);
                    if (dist < bestBotDistance) {
                        bestBotDistance = dist;
                        bestBotDoc = botDoc;
                        bestBotData = botData;
                    }
                }
                if (bestBotDoc && bestBotData) {
                    console.log(`[Matchmaking] Selected bot=${bestBotDoc.id} dist=${Math.round(bestBotDistance)} difficulty=${bestBotData.botDifficulty ?? "na"}`);
                    bestMatch = { id: bestBotDoc.id, ...bestBotData, isBot: true, source: "bot_pool" };
                }
            }
            else {
                console.log("[Matchmaking] Bot pool empty (no AVAILABLE bots).");
            }
        }
        if (bestMatch) {
            const matchId = (0, nanoid_1.nanoid)(20);
            const matchRef = firestore_1.db.collection(MATCHES_COLLECTION).doc(matchId);
            // Bot pool'dan gelen botlar için category kullan (eğer category yoksa kullanıcının seçtiği kategoriyi kullan)
            const matchCategory = bestMatch.source === "queue" ? bestMatch.category : category;
            // Sync duel match state initialize
            const syncDuel = {
                questions: [],
                correctCounts: {
                    [uid]: 0,
                    [bestMatch.id]: 0,
                },
                roundWins: {
                    [uid]: 0,
                    [bestMatch.id]: 0,
                },
                currentQuestionIndex: -1,
                matchStatus: "WAITING_PLAYERS",
                disconnectedAt: {},
                reconnectDeadline: {},
                rageQuitUids: [],
                category: matchCategory,
            };
            const matchDoc = {
                createdAt: nowTimestamp,
                status: "ACTIVE",
                mode: "SYNC_DUEL",
                players: [uid, bestMatch.id],
                syncDuel,
                stateByUid: {
                    [uid]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
                    [bestMatch.id]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
                },
                playerTypes: { [uid]: "HUMAN", [bestMatch.id]: bestMatch.isBot ? "BOT" : "HUMAN" },
            };
            tx.set(matchRef, matchDoc);
            tx.update(userRef, { "presence.activeMatchCount": firestore_1.FieldValue.increment(1) });
            if (bestMatch.source === "queue") {
                tx.update(firestore_1.db.collection(MATCH_QUEUE_COLLECTION).doc(bestMatch.id), { status: "MATCHED", matchedMatchId: matchId });
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
            category,
            isBot: false,
        };
        tx.set(ticketRef, newTicket);
        return { status: "QUEUED", matchId: null, opponentType: null, waitSeconds };
    });
    return result;
});
