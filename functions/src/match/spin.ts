// functions/src/match/spin.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import { ALL_SYMBOLS, type SymbolKey } from "../shared/constants";
import crypto from "node:crypto";

/**
 * IMPORTANT:
 * - Seed script randomHash'ı hex (0-9a-f) ve 12 chars üretmişti.
 * - Burada da aynı formatı üretelim ki range queries düzgün çalışsın.
 */
function genRandomHashHex(len = 12): string {
  // 6 bytes => 12 hex chars
  const bytes = crypto.randomBytes(Math.ceil(len / 2));
  return bytes.toString("hex").slice(0, len);
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Optimized random question fetch (transaction-safe):
 * - where(randomHash >= r) orderBy(randomHash) limit(1)
 * - wrap-around: where(randomHash < r) orderBy(randomHash) limit(1)
 * - retry a few times to avoid usedQuestionIds
 */
async function pickRandomQuestionIdTx(params: {
  tx: FirebaseFirestore.Transaction;
  category: string;
  used: Set<string>;
  maxAttempts?: number;
}): Promise<string> {
  const { tx, category, used, maxAttempts = 6 } = params;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const r = genRandomHashHex(12);

    // First try: >= r
    let q = db
      .collection("questions")
      .where("isActive", "==", true)
      .where("category", "==", category)
      .where("randomHash", ">=", r)
      .orderBy("randomHash")
      .limit(1);

    let snap = await tx.get(q);

    // Wrap-around: < r
    if (snap.empty) {
      q = db
        .collection("questions")
        .where("isActive", "==", true)
        .where("category", "==", category)
        .where("randomHash", "<", r)
        .orderBy("randomHash")
        .limit(1);

      snap = await tx.get(q);
    }

    if (snap.empty) continue;

    const id = snap.docs[0].id;
    if (!used.has(id)) return id;
  }

  // Temelden doğru hata: hangi kategori tükendi?
  throw new HttpsError(
    "resource-exhausted",
    `No unused questions available for category "${category}" (random selection retries exhausted).`
  );
}

export const matchSpin = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  const matchId = String(req.data?.matchId ?? "").trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId required");

  const matchRef = db.collection("matches").doc(matchId);

  const result = await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found");

    const match = matchSnap.data() as any;

    if (match.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Match not active");
    if (match.turn?.phase !== "SPIN") throw new HttpsError("failed-precondition", "Not in SPIN phase");
    if (match.turn?.currentUid !== uid) throw new HttpsError("failed-precondition", "Not your turn");

    const myState = match.stateByUid?.[uid];
    if (!myState) throw new HttpsError("internal", "Player state missing");

    // --- CRITICAL RULE: preserve symbol pool logic ---
    const owned: SymbolKey[] = (myState.symbols ?? []) as SymbolKey[];
    const available = ALL_SYMBOLS.filter((s) => !owned.includes(s));
    // --------------------------------------------------

    if (available.length === 0) {
      tx.update(matchRef, {
        status: "FINISHED",
        winnerUid: uid,
        endedReason: "ALL_SYMBOLS_ALREADY_OWNED",
      });
      return { matchId, symbol: ALL_SYMBOLS[0], questionId: "" };
    }

    // ✅ Symbol now IS the category
    const symbol = pickRandom(available);

    const usedArr: string[] = match.turn?.usedQuestionIds ?? [];
    const usedSet = new Set<string>(usedArr);

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
