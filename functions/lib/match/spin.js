"use strict";
// functions/src/match/spin.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchSpin = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const constants_1 = require("../shared/constants");
const node_crypto_1 = __importDefault(require("node:crypto"));
/**
 * IMPORTANT:
 * - Seed script randomHash'ı hex (0-9a-f) ve 12 chars üretmişti.
 * - Burada da aynı formatı üretelim ki range queries düzgün çalışsın.
 */
function genRandomHashHex(len = 12) {
    // 6 bytes => 12 hex chars
    const bytes = node_crypto_1.default.randomBytes(Math.ceil(len / 2));
    return bytes.toString("hex").slice(0, len);
}
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
/**
 * Optimized random question fetch (transaction-safe):
 * - where(randomHash >= r) orderBy(randomHash) limit(1)
 * - wrap-around: where(randomHash < r) orderBy(randomHash) limit(1)
 * - retry a few times to avoid usedQuestionIds
 */
async function pickRandomQuestionIdTx(params) {
    const { tx, category, used, maxAttempts = 6 } = params;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const r = genRandomHashHex(12);
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
    }
    // Temelden doğru hata: hangi kategori tükendi?
    throw new https_1.HttpsError("resource-exhausted", `No unused questions available for category "${category}" (random selection retries exhausted).`);
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
        const available = constants_1.ALL_SYMBOLS.filter((s) => !owned.includes(s));
        // --------------------------------------------------
        if (available.length === 0) {
            tx.update(matchRef, {
                status: "FINISHED",
                winnerUid: uid,
                endedReason: "ALL_SYMBOLS_ALREADY_OWNED",
            });
            return { matchId, symbol: constants_1.ALL_SYMBOLS[0], questionId: "" };
        }
        // ✅ Symbol now IS the category
        const symbol = pickRandom(available);
        const usedArr = match.turn?.usedQuestionIds ?? [];
        const usedSet = new Set(usedArr);
        // ✅ Pull question from the symbol/category pool
        const questionId = await pickRandomQuestionIdTx({
            tx,
            category: symbol,
            used: usedSet,
            maxAttempts: 6,
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
