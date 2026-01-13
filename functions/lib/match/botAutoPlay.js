"use strict";
/**
 * Bot Auto Play (Sync Duel)
 *
 * When a SYNC_DUEL match has a BOT player and a question becomes active,
 * bot answers after a deterministic (retry-safe) delay with difficulty-based accuracy.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchBotAutoPlay = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("../utils/firestore");
const syncDuel_engine_1 = require("./syncDuel.engine");
const constants_1 = require("../shared/constants");
const CHOICES = ["A", "B", "C", "D", "E"];
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function mapDifficultyToPCorrect(botDifficulty) {
    const d = clamp(Math.floor(botDifficulty || 5), 1, 10);
    // 1 -> 0.35, 10 -> 0.92 (linear)
    return 0.35 + ((d - 1) * (0.92 - 0.35)) / 9;
}
function pickBotAnswer(params) {
    const { seed, botDifficulty, correctAnswer } = params;
    const d = clamp(Math.floor(botDifficulty || 5), 1, 10);
    const pCorrect = mapDifficultyToPCorrect(d);
    const r = (seed % 10_000) / 10_000;
    // delay: difficulty yükseldikçe hızlansın, seed ile jitter
    const base = clamp(6500 - d * 450, 1200, 6500);
    const jitter = seed % 800; // 0..799
    const delayMs = clamp(base + jitter, 1200, 7000);
    if (r < pCorrect) {
        return { answer: correctAnswer, delayMs };
    }
    const others = CHOICES.filter((c) => c !== correctAnswer);
    const idx = ((seed >> 8) >>> 0) % others.length;
    return { answer: others[idx], delayMs };
}
exports.matchBotAutoPlay = (0, firestore_1.onDocumentUpdated)({ document: "matches/{matchId}", region: constants_1.FUNCTIONS_REGION }, async (event) => {
    const after = event.data?.after.data();
    if (!after)
        return;
    if (after.mode !== "SYNC_DUEL")
        return;
    if (after.status !== "ACTIVE")
        return;
    const matchId = event.params.matchId;
    const syncDuel = after.syncDuel;
    if (!syncDuel)
        return;
    if (syncDuel.matchStatus !== "QUESTION_ACTIVE")
        return;
    const playerTypes = after.playerTypes ?? {};
    const botUid = Object.keys(playerTypes).find((uid) => playerTypes[uid] === "BOT") ?? null;
    if (!botUid)
        return;
    const currentQuestion = syncDuel.questions[syncDuel.currentQuestionIndex];
    if (!currentQuestion)
        return;
    // If bot already answered, no-op
    if (currentQuestion.answers?.[botUid]?.choice !== null)
        return;
    // Read bot difficulty (outside TX ok)
    const botSnap = await firestore_2.db.collection("bot_pool").doc(botUid).get();
    const botDifficulty = Number(botSnap.data()?.botDifficulty ?? 5);
    // Read question correct answer (outside TX ok; we re-check match state in TX after delay)
    const qSnap = await firestore_2.db.collection("questions").doc(currentQuestion.questionId).get();
    if (!qSnap.exists)
        return;
    const q = qSnap.data();
    if (!q)
        return;
    const correctAnswer = q.answer;
    const seed = (0, syncDuel_engine_1.hashStringToInt)(`${matchId}:${currentQuestion.questionId}:${botUid}`);
    const { answer, delayMs } = pickBotAnswer({ seed, botDifficulty, correctAnswer });
    await sleep(delayMs);
    const matchRef = firestore_2.db.collection("matches").doc(matchId);
    const serverReceiveAt = Date.now();
    try {
        await firestore_2.db.runTransaction(async (tx) => {
            const snap = await tx.get(matchRef);
            if (!snap.exists)
                return;
            const match = snap.data();
            if (!match)
                return;
            if (match.status !== "ACTIVE")
                return;
            if (match.mode !== "SYNC_DUEL")
                return;
            const sd = match.syncDuel;
            if (!sd)
                return;
            if (sd.matchStatus !== "QUESTION_ACTIVE")
                return;
            const cq = sd.questions[sd.currentQuestionIndex];
            if (!cq)
                return;
            if (cq.questionId !== currentQuestion.questionId)
                return; // question moved on
            if (cq.answers?.[botUid]?.choice !== null)
                return; // already answered
            // Apply using shared engine (ensures same rules as humans)
            await (0, syncDuel_engine_1.applySyncDuelAnswerTx)({
                tx,
                matchRef,
                matchId,
                match,
                uid: botUid,
                answer,
                clientElapsedMs: delayMs,
                serverReceiveAt,
            });
        });
    }
    catch (e) {
        // Expected races are fine: already answered, question not active, etc.
        if (e instanceof https_1.HttpsError)
            return;
        return;
    }
});
