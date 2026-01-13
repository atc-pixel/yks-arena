"use strict";
/**
 * timeoutSyncDuelQuestion Function
 *
 * 60 saniye timeout olduğunda çağrılır.
 * Sıradaki soruya geçer (QUESTION_RESULT → sonra QUESTION_ACTIVE olacak).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchTimeoutSyncDuelQuestion = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const validation_1 = require("../shared/validation");
const constants_1 = require("../shared/constants");
exports.matchTimeoutSyncDuelQuestion = (0, https_1.onCall)({ region: constants_1.FUNCTIONS_REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const { matchId } = (0, validation_1.strictParse)(validation_1.TimeoutSyncDuelQuestionInputSchema, req.data, "matchTimeoutSyncDuelQuestion");
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const nowMs = Date.now();
    await firestore_1.db.runTransaction(async (tx) => {
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = matchSnap.data();
        if (!match)
            throw new https_1.HttpsError("internal", "Match data invalid");
        if (match.mode !== "SYNC_DUEL")
            throw new https_1.HttpsError("failed-precondition", "Not a sync duel match");
        if (match.status !== "ACTIVE")
            throw new https_1.HttpsError("failed-precondition", "Match not active");
        const syncDuel = match.syncDuel;
        if (!syncDuel)
            throw new https_1.HttpsError("internal", "SyncDuel state missing");
        if (syncDuel.matchStatus !== "QUESTION_ACTIVE") {
            throw new https_1.HttpsError("failed-precondition", "Question not active");
        }
        // Aktif soruyu bul
        const currentQuestion = syncDuel.questions[syncDuel.currentQuestionIndex];
        if (!currentQuestion) {
            throw new https_1.HttpsError("failed-precondition", "No active question");
        }
        // Timeout kontrolü: 60 saniye geçmiş mi?
        const elapsedMs = nowMs - currentQuestion.serverStartAt;
        if (elapsedMs < 60000) {
            throw new https_1.HttpsError("failed-precondition", "Timeout not reached yet");
        }
        // Henüz bitmemişse timeout olarak işaretle
        if (currentQuestion.endedReason === null) {
            const updatedQuestions = [...syncDuel.questions];
            updatedQuestions[syncDuel.currentQuestionIndex] = {
                ...currentQuestion,
                endedReason: "TIMEOUT",
                endedAt: nowMs,
            };
            tx.update(matchRef, {
                "syncDuel.questions": updatedQuestions,
                "syncDuel.matchStatus": "QUESTION_RESULT",
            });
        }
    });
    return { success: true };
});
