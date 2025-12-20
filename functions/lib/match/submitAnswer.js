"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchSubmitAnswer = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
exports.matchSubmitAnswer = (0, https_1.onCall)(async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const matchId = String(req.data?.matchId ?? "").trim();
    const answer = String(req.data?.answer ?? "").trim();
    if (!matchId)
        throw new https_1.HttpsError("invalid-argument", "matchId required");
    if (!["A", "B", "C", "D", "E"].includes(answer)) {
        throw new https_1.HttpsError("invalid-argument", "answer must be one of A/B/C/D/E");
    }
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const result = await firestore_1.db.runTransaction(async (tx) => {
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = matchSnap.data();
        if (match.status !== "ACTIVE")
            throw new https_1.HttpsError("failed-precondition", "Match not active");
        if (match.turn?.phase !== "QUESTION")
            throw new https_1.HttpsError("failed-precondition", "Not in QUESTION phase");
        if (match.turn?.currentUid !== uid)
            throw new https_1.HttpsError("failed-precondition", "Not your turn");
        const questionId = match.turn?.activeQuestionId ?? null;
        const symbol = match.turn?.challengeSymbol ?? null; // category of the question
        if (!questionId)
            throw new https_1.HttpsError("internal", "activeQuestionId missing");
        if (!symbol)
            throw new https_1.HttpsError("internal", "challengeSymbol missing");
        const players = match.players ?? [];
        if (!Array.isArray(players) || players.length !== 2) {
            throw new https_1.HttpsError("failed-precondition", "Match requires exactly 2 players");
        }
        const oppUid = players.find((p) => p !== uid);
        if (!oppUid)
            throw new https_1.HttpsError("internal", "Opponent not found");
        const myState = match.stateByUid?.[uid];
        if (!myState)
            throw new https_1.HttpsError("internal", "Player state missing");
        // Read question
        const qRef = firestore_1.db.collection("questions").doc(questionId);
        const qSnap = await tx.get(qRef);
        if (!qSnap.exists)
            throw new https_1.HttpsError("failed-precondition", "Question doc missing");
        const q = qSnap.data();
        const correctAnswer = q.answer;
        const isCorrect = answer === correctAnswer;
        const nextMyState = { ...myState };
        nextMyState.answeredCount = (nextMyState.answeredCount ?? 0) + 1;
        let earnedSymbol = null;
        // streak tracking fields on turn
        const prevStreak = Number(match.turn?.streak ?? 0);
        const prevStreakSymbol = (match.turn?.streakSymbol ?? null);
        let nextTurnStreak = 0;
        let nextTurnStreakSymbol = null;
        if (isCorrect) {
            nextMyState.points = (nextMyState.points ?? 0) + 1;
            // Same-category streak only
            if (prevStreakSymbol === symbol) {
                nextTurnStreak = prevStreak + 1;
                nextTurnStreakSymbol = symbol;
            }
            else {
                nextTurnStreak = 1;
                nextTurnStreakSymbol = symbol;
            }
            // 2 correct in same category => earn symbol (if not already)
            if (nextTurnStreak >= 2) {
                const owned = (nextMyState.symbols ?? []);
                if (!owned.includes(symbol)) {
                    nextMyState.symbols = [...owned, symbol];
                    earnedSymbol = symbol;
                }
                // reset streak after the award attempt
                nextTurnStreak = 0;
                nextTurnStreakSymbol = null;
            }
        }
        else {
            nextMyState.wrongCount = (nextMyState.wrongCount ?? 0) + 1;
            nextMyState.lives = Math.max(0, (nextMyState.lives ?? 0) - 1);
            // wrong resets streak
            nextTurnStreak = 0;
            nextTurnStreakSymbol = null;
        }
        // Win condition: 4 symbols collected
        const mySymbolsCount = (nextMyState.symbols ?? []).length;
        const finishedBySymbols = mySymbolsCount >= 4;
        let newStatus = "ACTIVE";
        let winnerUid = null;
        if (finishedBySymbols) {
            newStatus = "FINISHED";
            winnerUid = uid;
        }
        // Turn result persisted for UI feedback
        const turnResult = {
            uid,
            questionId,
            symbol,
            answer,
            correctAnswer,
            isCorrect,
            earnedSymbol,
            at: Date.now(),
        };
        // Phase always returns to SPIN after answering (engine rule)
        const nextPhase = newStatus === "FINISHED" ? "END" : "SPIN";
        // ✅ Turn ownership rule:
        // - Correct => keep currentUid (same player continues)
        // - Wrong   => pass to opponent
        const nextCurrentUid = isCorrect ? uid : oppUid;
        const update = {
            status: newStatus,
            ...(winnerUid ? { winnerUid, endedReason: "ALL_SYMBOLS_OWNED" } : {}),
            [`stateByUid.${uid}`]: nextMyState,
            "turn.phase": nextPhase,
            "turn.activeQuestionId": null,
            // We clear the current question symbol; next spin decides again
            "turn.challengeSymbol": null,
            "turn.currentUid": nextCurrentUid,
            "turn.streak": nextTurnStreak,
            "turn.streakSymbol": nextTurnStreakSymbol,
            "turn.lastResult": turnResult,
        };
        tx.update(matchRef, update);
        return {
            matchId,
            status: newStatus,
            phase: nextPhase,
            isCorrect,
            earnedSymbol,
            currentUid: nextCurrentUid,
            streak: nextTurnStreak,
            streakSymbol: nextTurnStreakSymbol,
            points: nextMyState.points,
            lives: nextMyState.lives,
            symbolsCount: mySymbolsCount,
        };
    });
    return result;
});
