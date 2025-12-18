"use strict";
// functions/src/match/spin.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchSpin = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const constants_1 = require("../shared/constants");
/**
 * Generates a lexicographically sortable random hash string.
 * We store question.randomHash as a fixed-length string (e.g. 16 chars).
 * This produces a uniform-ish distribution for range queries.
 */
function genRandomHash(len = 16) {
    // base36 -> [0-9a-z], pad to fixed length
    const s = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return s.slice(0, len).padEnd(len, "0");
}
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
/**
 * Optimized random question fetch:
 * - 1 doc read (ideally) using where(randomHash >= r).orderBy(randomHash).limit(1)
 * - If empty, wrap-around with where(randomHash < r).orderBy(randomHash).limit(1)
 *
 * Also attempts to avoid usedQuestionIds with a few retries (still O(1) reads per attempt).
 */
async function pickRandomQuestionIdTx(params) {
    const { tx, category, used, maxAttempts = 4 } = params;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const r = genRandomHash(16);
        // First try: >= r
        let q = firestore_1.db
            .collection("questions")
            .where("isActive", "==", true)
            .where("category", "==", category)
            .where("randomHash", ">=", r)
            .orderBy("randomHash")
            .limit(1);
        let snap = await tx.get(q);
        // Wrap-around: < r
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
        // Collision with used question -> retry with another random hash.
    }
    throw new https_1.HttpsError("resource-exhausted", "No unused questions available (random selection retries exhausted).");
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
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = matchSnap.data();
        if (match.status !== "ACTIVE")
            throw new https_1.HttpsError("failed-precondition", "Match not active");
        if (match.turn?.phase !== "SPIN")
            throw new https_1.HttpsError("failed-precondition", "Not in SPIN phase");
        if (match.turn?.currentUid !== uid)
            throw new https_1.HttpsError("failed-precondition", "Not your turn");
        const myState = match.stateByUid?.[uid];
        if (!myState)
            throw new https_1.HttpsError("internal", "Player state missing");
        // --- CRITICAL RULE: preserve symbol pool logic ---
        const owned = (myState.symbols ?? []);
        const available = constants_1.ALL_SYMBOLS.filter((s) => !owned.includes(s)); // keep as-is per requirement
        // --------------------------------------------------
        if (available.length === 0) {
            // Safety fallback: already has all symbols
            tx.update(matchRef, {
                status: "FINISHED",
                winnerUid: uid,
                endedReason: "ALL_SYMBOLS_ALREADY_OWNED",
            });
            return { matchId, symbol: constants_1.ALL_SYMBOLS[0], questionId: "" };
        }
        const symbol = pickRandom(available);
        const usedArr = match.turn?.usedQuestionIds ?? [];
        const usedSet = new Set(usedArr);
        // Random question (1 doc read per attempt, wrap-around is still 1 extra read only when needed)
        const questionId = await pickRandomQuestionIdTx({
            tx,
            category: constants_1.DEFAULT_CATEGORY,
            used: usedSet,
            maxAttempts: 4,
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
