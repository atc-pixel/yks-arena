"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashStringToInt = hashStringToInt;
exports.calcKupaForCorrectAnswer = calcKupaForCorrectAnswer;
exports.applySyncDuelAnswerTx = applySyncDuelAnswerTx;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const GRACE_MS = 300;
// Deterministic hash function (retry-safe, Math.random yok)
function hashStringToInt(input) {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
        h = (h * 31 + input.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}
/**
 * Elo yokken deterministic 0..5 kupa.
 * Retry olursa değişmesin diye Math.random yok.
 */
function calcKupaForCorrectAnswer(params) {
    const seed = hashStringToInt(`${params.matchId}:${params.questionId}:${params.uid}`);
    return seed % 6; // 0..5
}
async function applySyncDuelAnswerTx(params) {
    const { tx, matchRef, matchId, match, uid, answer, clientElapsedMs, serverReceiveAt } = params;
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
    const currentQuestion = syncDuel.questions[syncDuel.currentQuestionIndex];
    if (!currentQuestion)
        throw new https_1.HttpsError("failed-precondition", "No active question");
    if (currentQuestion.answers[uid]?.choice !== null) {
        throw new https_1.HttpsError("failed-precondition", "Already answered");
    }
    const questionRef = firestore_1.db.collection("questions").doc(currentQuestion.questionId);
    const questionSnap = await tx.get(questionRef);
    if (!questionSnap.exists)
        throw new https_1.HttpsError("internal", "Question missing");
    const question = questionSnap.data();
    if (!question)
        throw new https_1.HttpsError("internal", "Question data invalid");
    const correctAnswer = question.answer;
    const isCorrect = answer === correctAnswer;
    const updatedAnswers = {
        ...currentQuestion.answers,
        [uid]: {
            choice: answer,
            isCorrect,
            clientElapsedMs,
            serverReceiveAt,
        },
    };
    const updatedQuestion = {
        ...currentQuestion,
        answers: updatedAnswers,
    };
    const [uid1, uid2] = match.players;
    if (isCorrect) {
        // Grace window (lag compensation):
        // - İlk doğru cevap -> pending set et, kararı hemen verme.
        // - İkinci doğru cevap grace window içinde gelirse bu TX içinde kararı ver.
        // - İkinci doğru çok geç gelirse pendingWinnerUid kazanır (bu TX içinde finalize eder).
        const pendingWinnerUid = currentQuestion.pendingWinnerUid ?? null;
        const decisionAt = currentQuestion.decisionAt ?? null;
        // 1) First correct -> set pending and keep QUESTION_ACTIVE
        if (!pendingWinnerUid) {
            const updatedQuestions = [...syncDuel.questions];
            updatedQuestions[syncDuel.currentQuestionIndex] = {
                ...updatedQuestion,
                pendingWinnerUid: uid,
                decisionAt: serverReceiveAt + GRACE_MS,
                endedReason: null,
                endedAt: null,
            };
            tx.update(matchRef, {
                "syncDuel.questions": updatedQuestions,
            });
            return;
        }
        // 2) Second correct -> decide now if within grace, otherwise pending wins
        const inGrace = typeof decisionAt === "number" ? serverReceiveAt < decisionAt : false;
        const pendingAns = updatedAnswers[pendingWinnerUid];
        const pendingReceiveAt = pendingAns?.serverReceiveAt ?? null;
        const pendingClientElapsedMs = pendingAns?.clientElapsedMs ?? null;
        let winnerUid = pendingWinnerUid;
        if (inGrace && pendingReceiveAt !== null) {
            // primary: serverReceiveAt
            if (serverReceiveAt < pendingReceiveAt) {
                winnerUid = uid;
            }
            else if (serverReceiveAt === pendingReceiveAt) {
                // tie-breaker: clientElapsedMs (best-effort, untrusted)
                const a = pendingClientElapsedMs;
                const b = clientElapsedMs;
                const aOk = typeof a === "number" && a >= 0 && a <= 60000;
                const bOk = typeof b === "number" && b >= 0 && b <= 60000;
                if (aOk && bOk) {
                    winnerUid = b < a ? uid : pendingWinnerUid;
                }
            }
        }
        const kupaAwarded = calcKupaForCorrectAnswer({
            matchId,
            questionId: currentQuestion.questionId,
            uid: winnerUid,
        });
        const currentTrophies = match.stateByUid[winnerUid]?.trophies ?? 0;
        const updatedCorrectCounts = { ...syncDuel.correctCounts };
        updatedCorrectCounts[winnerUid] = (updatedCorrectCounts[winnerUid] ?? 0) + 1;
        const updatedRoundWins = { ...(syncDuel.roundWins ?? {}) };
        updatedRoundWins[winnerUid] = (updatedRoundWins[winnerUid] ?? 0) + 1;
        let matchStatus = "QUESTION_RESULT";
        let finalWinnerUid;
        if (updatedCorrectCounts[winnerUid] >= 3) {
            matchStatus = "MATCH_FINISHED";
            finalWinnerUid = winnerUid;
        }
        const updatedQuestions = [...syncDuel.questions];
        updatedQuestions[syncDuel.currentQuestionIndex] = {
            ...updatedQuestion,
            endedReason: "CORRECT",
            endedAt: serverReceiveAt,
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
        return;
    }
    // Wrong answer branch
    const otherUid = uid === uid1 ? uid2 : uid1;
    const otherAnswer = updatedAnswers[otherUid];
    // 2 wrong answers total -> advance
    if (otherAnswer?.choice !== null && otherAnswer?.isCorrect === false) {
        updatedQuestion.endedReason = "TWO_WRONG";
        updatedQuestion.endedAt = serverReceiveAt;
        const updatedQuestions = [...syncDuel.questions];
        updatedQuestions[syncDuel.currentQuestionIndex] = updatedQuestion;
        tx.update(matchRef, {
            "syncDuel.questions": updatedQuestions,
            "syncDuel.matchStatus": "QUESTION_RESULT",
        });
        return;
    }
    // Only this player's wrong answer; keep QUESTION_ACTIVE
    const updatedQuestions = [...syncDuel.questions];
    updatedQuestions[syncDuel.currentQuestionIndex] = updatedQuestion;
    tx.update(matchRef, {
        "syncDuel.questions": updatedQuestions,
    });
}
