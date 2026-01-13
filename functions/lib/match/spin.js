"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchSpin = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const constants_1 = require("../shared/constants");
const validation_1 = require("../shared/validation");
const RANDOM_ID_MAX = 10_000_000;
function randInt(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
}
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
/**
 * Random ID Inequality pattern inside a transaction.
 * Avoids usedQuestionIds with retries.
 */
async function pickRandomQuestionIdTx(params) {
    const { tx, category, used, maxAttempts = 12 } = params;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const r = randInt(RANDOM_ID_MAX);
        // >= r (ASC)
        let q = firestore_1.db
            .collection("questions")
            .where("isActive", "==", true)
            .where("category", "==", category)
            .where("randomId", ">=", r)
            .orderBy("randomId", "asc")
            .limit(1);
        let snap = await tx.get(q);
        // wrap-around: < r (DESC)
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
exports.matchSpin = (0, https_1.onCall)({ region: "us-central1" }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    // Zod validation
    let validatedInput;
    try {
        validatedInput = (0, validation_1.strictParse)(validation_1.SpinInputSchema, req.data, "matchSpin");
    }
    catch (error) {
        throw new https_1.HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid input");
    }
    const matchId = validatedInput.matchId;
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const result = await firestore_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(matchRef);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = snap.data();
        if (!match)
            throw new https_1.HttpsError("internal", "Match data is invalid");
        if (match.status !== "ACTIVE")
            throw new https_1.HttpsError("failed-precondition", "Match not active");
        if (match.turn?.phase !== "SPIN")
            throw new https_1.HttpsError("failed-precondition", "Not in SPIN phase");
        if (match.turn?.currentUid !== uid)
            throw new https_1.HttpsError("failed-precondition", "Not your turn");
        const myState = match.stateByUid?.[uid];
        if (!myState)
            throw new https_1.HttpsError("internal", "Player state missing");
        // already in middle of 2-question chain? don't allow spin
        const qi = Number(match.turn?.questionIndex ?? 0);
        if (qi !== 0)
            throw new https_1.HttpsError("failed-precondition", "Cannot spin while a category chain is active");
        // symbol pool: remove owned categories
        const owned = (myState.symbols ?? []);
        const available = constants_1.ALL_SYMBOLS.filter((s) => !owned.includes(s));
        if (available.length === 0) {
            tx.update(matchRef, {
                status: "FINISHED",
                winnerUid: uid,
                endedReason: "ALL_SYMBOLS_OWNED",
                "turn.phase": "END",
            });
            return { matchId, symbol: constants_1.ALL_SYMBOLS[0], questionId: "" };
        }
        const symbol = pickRandom(available);
        const usedArr = match.turn?.usedQuestionIds ?? [];
        const usedSet = new Set(usedArr);
        // Pick first question for this symbol/category
        const questionId = await pickRandomQuestionIdTx({
            tx,
            category: symbol,
            used: usedSet,
            maxAttempts: 12,
        });
        tx.update(matchRef, {
            "turn.phase": "QUESTION",
            "turn.challengeSymbol": symbol,
            "turn.activeQuestionId": questionId,
            "turn.usedQuestionIds": [...usedArr, questionId],
            "turn.questionIndex": 1, // ✅ first question
        });
        return { matchId, symbol, questionId };
    });
    return result;
});
