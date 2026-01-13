"use strict";
/**
 * finalizeSyncDuelDecision Function (Cleanup / Fallback)
 *
 * Grace window pending state'i finalize eder.
 * - Normal durumda 2. doğru cevap grace içindeyse submitAnswer TX içinde karar verilir.
 * - Bu callable sadece 2. doğru cevap hiç gelmezse (veya client gecikirse) pending'i temizlemek için kullanılır.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchFinalizeSyncDuelDecision = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const validation_1 = require("../shared/validation");
const constants_1 = require("../shared/constants");
const syncDuel_engine_1 = require("./syncDuel.engine");
const GRACE_MS = 300;
function pickWinnerUid(params) {
    const { pendingWinnerUid, challengerUid, pending, challenger, decisionAt } = params;
    const pendingReceiveAt = pending?.serverReceiveAt ?? null;
    const pendingClientElapsedMs = pending?.clientElapsedMs ?? null;
    // challenger within grace window
    if (challenger.serverReceiveAt < decisionAt && pendingReceiveAt !== null) {
        if (challenger.serverReceiveAt < pendingReceiveAt)
            return challengerUid;
        if (challenger.serverReceiveAt > pendingReceiveAt)
            return pendingWinnerUid;
        const a = pendingClientElapsedMs;
        const b = challenger.clientElapsedMs;
        const aOk = typeof a === "number" && a >= 0 && a <= 60000;
        const bOk = typeof b === "number" && b >= 0 && b <= 60000;
        if (aOk && bOk)
            return b < a ? challengerUid : pendingWinnerUid;
    }
    return pendingWinnerUid;
}
exports.matchFinalizeSyncDuelDecision = (0, https_1.onCall)({ region: constants_1.FUNCTIONS_REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const { matchId } = (0, validation_1.strictParse)(validation_1.FinalizeSyncDuelDecisionInputSchema, req.data, "matchFinalizeSyncDuelDecision");
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const nowMs = Date.now();
    await firestore_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(matchRef);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = snap.data();
        if (!match)
            throw new https_1.HttpsError("internal", "Match data invalid");
        if (match.mode !== "SYNC_DUEL")
            throw new https_1.HttpsError("failed-precondition", "Not a sync duel match");
        if (match.status !== "ACTIVE")
            return; // already finished/cancelled
        const sd = match.syncDuel;
        if (!sd)
            throw new https_1.HttpsError("internal", "SyncDuel state missing");
        if (sd.matchStatus !== "QUESTION_ACTIVE")
            return; // already decided
        const cq = sd.questions[sd.currentQuestionIndex];
        if (!cq)
            throw new https_1.HttpsError("failed-precondition", "No active question");
        if (cq.endedReason !== null)
            return;
        const pendingWinnerUid = cq.pendingWinnerUid ?? null;
        const decisionAt = cq.decisionAt ?? null;
        if (!pendingWinnerUid || typeof decisionAt !== "number")
            return;
        // Decision time reached?
        if (nowMs < decisionAt) {
            throw new https_1.HttpsError("failed-precondition", "Decision time not reached yet");
        }
        const [uid1, uid2] = match.players;
        const a1 = cq.answers?.[uid1];
        const a2 = cq.answers?.[uid2];
        // If both are correct, pick winner (rare here; normally submitAnswer handles it)
        let winnerUid = pendingWinnerUid;
        const uid1Correct = a1?.isCorrect === true && typeof a1.serverReceiveAt === "number";
        const uid2Correct = a2?.isCorrect === true && typeof a2.serverReceiveAt === "number";
        if (uid1Correct && uid2Correct) {
            // Normalize: pendingWinnerUid is the first correct by design, but keep generic.
            const challengerUid = uid1 === pendingWinnerUid ? uid2 : uid1;
            const pendingAns = cq.answers?.[pendingWinnerUid];
            const challengerAns = cq.answers?.[challengerUid];
            const challenger = {
                clientElapsedMs: typeof challengerAns?.clientElapsedMs === "number" ? challengerAns.clientElapsedMs : GRACE_MS,
                serverReceiveAt: challengerAns?.serverReceiveAt ?? nowMs,
            };
            winnerUid = pickWinnerUid({
                pendingWinnerUid,
                challengerUid,
                pending: pendingAns,
                challenger,
                decisionAt,
            });
        }
        const kupaAwarded = (0, syncDuel_engine_1.calcKupaForCorrectAnswer)({
            matchId,
            questionId: cq.questionId,
            uid: winnerUid,
        });
        const currentTrophies = match.stateByUid[winnerUid]?.trophies ?? 0;
        const updatedCorrectCounts = { ...(sd.correctCounts ?? {}) };
        updatedCorrectCounts[winnerUid] = (updatedCorrectCounts[winnerUid] ?? 0) + 1;
        const updatedRoundWins = { ...(sd.roundWins ?? {}) };
        updatedRoundWins[winnerUid] = (updatedRoundWins[winnerUid] ?? 0) + 1;
        let matchStatus = "QUESTION_RESULT";
        let finalWinnerUid;
        if ((updatedCorrectCounts[winnerUid] ?? 0) >= 3) {
            matchStatus = "MATCH_FINISHED";
            finalWinnerUid = winnerUid;
        }
        const updatedQuestions = [...sd.questions];
        updatedQuestions[sd.currentQuestionIndex] = {
            ...cq,
            endedReason: "CORRECT",
            endedAt: nowMs,
            pendingWinnerUid: null,
            decisionAt: null,
        };
        tx.update(matchRef, {
            "syncDuel.questions": updatedQuestions,
            "syncDuel.correctCounts": updatedCorrectCounts,
            "syncDuel.roundWins": updatedRoundWins,
            "syncDuel.matchStatus": matchStatus,
            [`stateByUid.${winnerUid}.trophies`]: currentTrophies + kupaAwarded,
            ...(finalWinnerUid !== undefined && { winnerUid: finalWinnerUid }),
            ...(matchStatus === "MATCH_FINISHED" && { status: "FINISHED" }),
        });
    });
    return { success: true };
});
