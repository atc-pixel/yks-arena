import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import { ALL_SYMBOLS, type SymbolKey } from "../shared/constants";
import type { MatchDoc, PlayerState } from "../shared/types";
import { SpinInputSchema, strictParse } from "../shared/validation";

const RANDOM_ID_MAX = 10_000_000;

function randInt(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Random ID Inequality pattern inside a transaction.
 * Avoids usedQuestionIds with retries.
 */
async function pickRandomQuestionIdTx(params: {
  tx: FirebaseFirestore.Transaction;
  category: string;
  used: Set<string>;
  maxAttempts?: number;
}): Promise<string> {
  const { tx, category, used, maxAttempts = 12 } = params;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const r = randInt(RANDOM_ID_MAX);

    // >= r (ASC)
    let q = db
      .collection("questions")
      .where("isActive", "==", true)
      .where("category", "==", category)
      .where("randomId", ">=", r)
      .orderBy("randomId", "asc")
      .limit(1);

    let snap = await tx.get(q);

    // wrap-around: < r (DESC)
    if (snap.empty) {
      q = db
        .collection("questions")
        .where("isActive", "==", true)
        .where("category", "==", category)
        .where("randomId", "<", r)
        .orderBy("randomId", "desc")
        .limit(1);

      snap = await tx.get(q);
    }

    if (snap.empty) continue;

    const id = snap.docs[0].id;
    if (!used.has(id)) return id;
  }

  throw new HttpsError(
    "resource-exhausted",
    `No unused questions available for category "${category}" (randomId retries exhausted).`
  );
}

export const matchSpin = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  // Zod validation
  let validatedInput;
  try {
    validatedInput = strictParse(SpinInputSchema, req.data, "matchSpin");
  } catch (error) {
    throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid input");
  }

  const matchId = validatedInput.matchId;

  const matchRef = db.collection("matches").doc(matchId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new HttpsError("not-found", "Match not found");

    const match = snap.data() as MatchDoc | undefined;
    if (!match) throw new HttpsError("internal", "Match data is invalid");

    if (match.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Match not active");
    if (match.turn?.phase !== "SPIN") throw new HttpsError("failed-precondition", "Not in SPIN phase");
    if (match.turn?.currentUid !== uid) throw new HttpsError("failed-precondition", "Not your turn");

    const myState = match.stateByUid?.[uid] as PlayerState | undefined;
    if (!myState) throw new HttpsError("internal", "Player state missing");

    // already in middle of 2-question chain? don't allow spin
    const qi = Number(match.turn?.questionIndex ?? 0);
    if (qi !== 0) throw new HttpsError("failed-precondition", "Cannot spin while a category chain is active");

    // symbol pool: remove owned categories
    const owned: SymbolKey[] = (myState.symbols ?? []) as SymbolKey[];
    const available = ALL_SYMBOLS.filter((s) => !owned.includes(s));

    if (available.length === 0) {
      tx.update(matchRef, {
        status: "FINISHED",
        winnerUid: uid,
        endedReason: "ALL_SYMBOLS_OWNED",
        "turn.phase": "END",
      });
      return { matchId, symbol: ALL_SYMBOLS[0], questionId: "" };
    }

    const symbol = pickRandom(available);

    const usedArr: string[] = match.turn?.usedQuestionIds ?? [];
    const usedSet = new Set<string>(usedArr);

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
