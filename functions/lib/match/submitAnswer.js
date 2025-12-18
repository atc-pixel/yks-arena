"use strict";
// functions/src/match/submitAnswer.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchSubmitAnswer = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const constants_1 = require("../shared/constants");
/**
 * Same optimized random question fetch used after the 1st correct answer (to serve the 2nd streak question).
 */
function genRandomHash(len = 16) {
    const s = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return s.slice(0, len).padEnd(len, "0");
}
async function pickRandomQuestionIdTx(params) {
    const { tx, category, used, maxAttempts = 4 } = params;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const r = genRandomHash(16);
        let q = firestore_1.db
            .collection("questions")
            .where("isActive", "==", true)
            .where("category", "==", category)
            .where("randomHash", ">=", r)
            .orderBy("randomHash")
            .limit(1);
        let snap = await tx.get(q);
        if (snap.empty) {
            q = firestore_1.db
                .collection("questions")
                .where("isActive", "==", true)
                .where("category", "==", category)
                .where("randomHash", "<", r)
                .orderBy("randomHash")
                .limit(1);
            snap = await tx.get(q);
        }
        if (snap.empty)
            continue;
        const id = snap.docs[0].id;
        if (!used.has(id))
            return id;
    }
    throw new https_1.HttpsError("resource-exhausted", "No unused questions available (random selection retries exhausted).");
}
function otherPlayer(players, uid) {
    return players.find((p) => p !== uid) ?? "";
}
exports.matchSubmitAnswer = (0, https_1.onCall)(async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const matchId = String(req.data?.matchId ?? "").trim();
    const answerRaw = String(req.data?.answer ?? "").trim().toUpperCase();
    if (!matchId)
        throw new https_1.HttpsError("invalid-argument", "matchId required");
    if (!constants_1.CHOICE_KEYS.includes(answerRaw))
        throw new https_1.HttpsError("invalid-argument", "bad answer");
    const answer = answerRaw;
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const res = await firestore_1.db.runTransaction(async (tx) => {
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
        const players = match.players ?? [];
        const oppUid = otherPlayer(players, uid);
        if (!oppUid)
            throw new https_1.HttpsError("internal", "Opponent missing");
        const qid = match.turn?.activeQuestionId ?? null;
        const symbol = match.turn?.challengeSymbol ?? null;
        const streak = match.turn?.streak ?? 0;
        if (!qid || !symbol)
            throw new https_1.HttpsError("internal", "Turn missing question/symbol");
        // Read the single active question doc (1 read)
        const qRef = firestore_1.db.collection("questions").doc(qid);
        const qSnap = await tx.get(qRef);
        if (!qSnap.exists)
            throw new https_1.HttpsError("internal", "Question missing");
        const q = qSnap.data();
        const isCorrect = q.answer === answer;
        // Player states
        const stateByUid = { ...(match.stateByUid ?? {}) };
        const my = {
            lives: constants_1.DEFAULT_LIVES,
            points: 0,
            symbols: [],
            wrongCount: 0,
            answeredCount: 0, // still tracked for stats/UI if you want
            ...(stateByUid[uid] ?? {}),
        };
        const opp = {
            lives: constants_1.DEFAULT_LIVES,
            points: 0,
            symbols: [],
            wrongCount: 0,
            answeredCount: 0,
            ...(stateByUid[oppUid] ?? {}),
        };
        my.answeredCount = (my.answeredCount ?? 0) + 1;
        // Used question tracking
        const usedArr = match.turn?.usedQuestionIds ?? [];
        const usedSet = new Set(usedArr);
        if (!isCorrect) {
            my.wrongCount = (my.wrongCount ?? 0) + 1;
            stateByUid[uid] = my;
            stateByUid[oppUid] = opp;
            // Wrong: reset challenge, pass turn
            tx.update(matchRef, {
                stateByUid,
                "turn.phase": "SPIN",
                "turn.challengeSymbol": null,
                "turn.streak": 0,
                "turn.activeQuestionId": null,
                "turn.currentUid": oppUid,
            });
            return { matchId, status: "ACTIVE", phase: "SPIN" };
        }
        // Correct
        const nextStreak = streak === 0 ? 1 : 2;
        if (nextStreak === 1) {
            // Serve 2nd question for the same symbol (still same player)
            const nextQid = await pickRandomQuestionIdTx({
                tx,
                category: constants_1.DEFAULT_CATEGORY,
                used: usedSet,
                maxAttempts: 4,
            });
            stateByUid[uid] = my;
            stateByUid[oppUid] = opp;
            tx.update(matchRef, {
                stateByUid,
                "turn.phase": "QUESTION",
                "turn.streak": 1,
                "turn.activeQuestionId": nextQid,
                "turn.usedQuestionIds": [...usedArr, nextQid],
            });
            return { matchId, status: "ACTIVE", phase: "QUESTION" };
        }
        // nextStreak === 2 -> win symbol
        const owned = (my.symbols ?? []);
        const newOwned = owned.includes(symbol) ? owned : [...owned, symbol];
        my.symbols = newOwned;
        const hasAllSymbols = constants_1.ALL_SYMBOLS.every((s) => newOwned.includes(s));
        // ✅ Perfect Run Fix:
        // No longer tied to answeredCount === 8
        const isPerfect = hasAllSymbols && (my.wrongCount ?? 0) === 0;
        if (hasAllSymbols) {
            // MVP scoring:
            my.points = (my.points ?? 0) + 10;
            if (!isPerfect) {
                opp.lives = Math.max(0, (opp.lives ?? constants_1.DEFAULT_LIVES) - 1);
                opp.points = (opp.points ?? 0) - 10;
            }
            stateByUid[uid] = my;
            stateByUid[oppUid] = opp;
            tx.update(matchRef, {
                status: "FINISHED",
                winnerUid: uid,
                endedReason: isPerfect ? "PERFECT_RUN" : "ALL_SYMBOLS_COLLECTED",
                stateByUid,
                "turn.phase": "SPIN",
                "turn.challengeSymbol": null,
                "turn.streak": 0,
                "turn.activeQuestionId": null,
            });
            return { matchId, status: "FINISHED", phase: "SPIN" };
        }
        // Not finished: reset to SPIN, same player continues
        stateByUid[uid] = my;
        stateByUid[oppUid] = opp;
        tx.update(matchRef, {
            stateByUid,
            "turn.phase": "SPIN",
            "turn.challengeSymbol": null,
            "turn.streak": 0,
            "turn.activeQuestionId": null,
            // currentUid stays the same
        });
        return { matchId, status: "ACTIVE", phase: "SPIN" };
    });
    return res;
});
