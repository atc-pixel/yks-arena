"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchSpin = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const constants_1 = require("../shared/constants");
const RANDOM_ID_MAX = 10_000_000;
function randInt(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
}
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
/**
 * Pick a random question ID using Random ID Inequality pattern.
 * - category == X
 * - randomId >= r (ASC, limit 1)
 * - fallback: randomId < r (DESC, limit 1)
 * - retry if used
 */
async function pickRandomQuestionIdTx(params) {
    const { tx, category, used, maxAttempts = 10 } = params;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const r = randInt(RANDOM_ID_MAX);
        // Primary query (>= r)
        let q = firestore_1.db
            .collection("questions")
            .where("isActive", "==", true)
            .where("category", "==", category)
            .where("randomId", ">=", r)
            .orderBy("randomId", "asc")
            .limit(1);
        let snap = await tx.get(q);
        // Wrap-around (< r)
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
exports.matchSpin = (0, https_1.onCall)(async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const matchId = String(req.data?.matchId ?? "").trim();
    if (!matchId)
        throw new https_1.HttpsError("invalid-argument", "matchId required");
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const result = await firestore_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(matchRef);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = snap.data();
        if (match.status !== "ACTIVE")
            throw new https_1.HttpsError("failed-precondition", "Match not active");
        if (match.turn?.phase !== "SPIN")
            throw new https_1.HttpsError("failed-precondition", "Not in SPIN phase");
        if (match.turn?.currentUid !== uid)
            throw new https_1.HttpsError("failed-precondition", "Not your turn");
        const myState = match.stateByUid?.[uid];
        if (!myState)
            throw new https_1.HttpsError("internal", "Player state missing");
        // --- SYMBOL SELECTION (unchanged rule) ---
        const owned = (myState.symbols ?? []);
        const available = constants_1.ALL_SYMBOLS.filter((s) => !owned.includes(s));
        if (available.length === 0) {
            tx.update(matchRef, {
                status: "FINISHED",
                winnerUid: uid,
                endedReason: "ALL_SYMBOLS_OWNED",
            });
            return { matchId, symbol: constants_1.ALL_SYMBOLS[0], questionId: "" };
        }
        const symbol = pickRandom(available);
        // --- QUESTION SELECTION ---
        const usedArr = match.turn?.usedQuestionIds ?? [];
        const usedSet = new Set(usedArr);
        const questionId = await pickRandomQuestionIdTx({
            tx,
            category: symbol ?? constants_1.DEFAULT_CATEGORY,
            used: usedSet,
            maxAttempts: 10,
        });
        tx.update(matchRef, {
            "turn.phase": "QUESTION",
            "turn.challengeSymbol": symbol,
            "turn.streak": 0,
            "turn.activeQuestionId": questionId,
            "turn.usedQuestionIds": [...usedArr, questionId],
        });
        return { matchId, symbol, questionId };
    });
    return result;
});
