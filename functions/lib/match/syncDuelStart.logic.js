"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickRandomQuestionIdTx = pickRandomQuestionIdTx;
exports.startSyncDuelQuestionTx = startSyncDuelQuestionTx;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const RANDOM_ID_MAX = 10_000_000;
function randInt(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
}
/**
 * Random ID Inequality pattern inside a transaction.
 * Avoids usedQuestionIds with retries.
 */
async function pickRandomQuestionIdTx(params) {
    const { tx, category, used, maxAttempts = 14 } = params;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const r = randInt(RANDOM_ID_MAX);
        let q = firestore_1.db
            .collection("questions")
            .where("isActive", "==", true)
            .where("category", "==", category)
            .where("randomId", ">=", r)
            .orderBy("randomId", "asc")
            .limit(1);
        let snap = await tx.get(q);
        if (snap.empty) {
            q = firestore_1.db
                .collection("questions")
                .where("isActive", "==", true)
                .where("category", "==", category)
                .where("randomId", "<", r)
                .orderBy("randomId", "desc")
                .limit(1);
            snap = await tx.get(q);
        }
        if (snap.empty)
            continue;
        const id = snap.docs[0].id;
        if (!used.has(id))
            return id;
    }
    throw new https_1.HttpsError("resource-exhausted", `No unused questions available for category "${category}" (randomId retries exhausted).`);
}
/**
 * Shared transaction logic: start a new sync duel question.
 * - Idempotent: if already QUESTION_ACTIVE returns current question.
 * - Throws if match finished.
 */
async function startSyncDuelQuestionTx(params) {
    const { tx, matchRef, match, nowMs } = params;
    const syncDuel = match.syncDuel;
    if (!syncDuel)
        throw new https_1.HttpsError("internal", "SyncDuel state missing");
    if (syncDuel.matchStatus === "QUESTION_ACTIVE") {
        const current = syncDuel.questions[syncDuel.currentQuestionIndex];
        if (!current) {
            throw new https_1.HttpsError("internal", "Invariant violated: matchStatus QUESTION_ACTIVE but current question missing");
        }
        return { questionId: current.questionId, serverStartAt: current.serverStartAt };
    }
    const correctCounts = syncDuel.correctCounts ?? {};
    const [uid1, uid2] = match.players;
    if ((correctCounts[uid1] ?? 0) >= 3 || (correctCounts[uid2] ?? 0) >= 3) {
        throw new https_1.HttpsError("failed-precondition", "Match already finished");
    }
    const usedQuestionIds = new Set(syncDuel.questions.map((q) => q.questionId));
    const questionId = await pickRandomQuestionIdTx({
        tx,
        category: syncDuel.category,
        used: usedQuestionIds,
    });
    const newQuestionIndex = syncDuel.currentQuestionIndex + 1;
    const newQuestion = {
        questionId,
        serverStartAt: nowMs,
        answers: {
            [uid1]: {
                choice: null,
                isCorrect: null,
                clientElapsedMs: null,
                clientLatencyMs: null,
                serverReceiveAt: null,
            },
            [uid2]: {
                choice: null,
                isCorrect: null,
                clientElapsedMs: null,
                clientLatencyMs: null,
                serverReceiveAt: null,
            },
        },
        endedReason: null,
        endedAt: null,
        winnerUid: null,
        pendingWinnerUid: null,
        decisionAt: null,
    };
    tx.update(matchRef, {
        "syncDuel.questions": [...syncDuel.questions, newQuestion],
        "syncDuel.currentQuestionIndex": newQuestionIndex,
        "syncDuel.matchStatus": "QUESTION_ACTIVE",
    });
    return { questionId, serverStartAt: nowMs };
}
