"use strict";
/**
 * submitSyncDuelAnswer Function
 *
 * Sync duel match'inde soru cevabı gönderir.
 * - İlk doğru cevap gelince → hemen sıradaki soruya geç
 * - 2 yanlış cevap gelince → sıradaki soruya geç
 * - Doğru cevap için kupa hesapla (0-5 arası)
 * - 3 doğruya ulaşan kontrolü yap
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchSubmitSyncDuelAnswer = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const validation_1 = require("../shared/validation");
const syncDuel_engine_1 = require("./syncDuel.engine");
exports.matchSubmitSyncDuelAnswer = (0, https_1.onCall)({ region: "us-central1" }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const { matchId, roundId, answer, clientElapsedMs } = (0, validation_1.strictParse)(validation_1.SubmitSyncDuelAnswerInputSchema, req.data, "matchSubmitSyncDuelAnswer");
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const serverReceiveAt = Date.now(); // Server timestamp
    await firestore_1.db.runTransaction(async (tx) => {
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = matchSnap.data();
        if (!match)
            throw new https_1.HttpsError("internal", "Match data invalid");
        try {
            await (0, syncDuel_engine_1.applySyncDuelAnswerTx)({
                tx,
                matchRef,
                matchId,
                match,
                uid,
                answer,
                clientElapsedMs,
                serverReceiveAt,
            });
        }
        catch (e) {
            // Idempotency / race conditions:
            // - UI stale olabilir (bot cevapladı, soru bitti, vs.)
            // - Çift tıklama / latency ile ikinci istek gelebilir
            // Bu durumlarda 400 üretip console'u kirletmek yerine no-op dönelim.
            if (e instanceof https_1.HttpsError && e.code === "failed-precondition") {
                const msg = String(e.message || "");
                const isIgnorable = msg.includes("Already answered") ||
                    msg.includes("Question not active") ||
                    msg.includes("No active question");
                if (isIgnorable)
                    return;
            }
            throw e;
        }
    });
    return { success: true };
});
