import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type { SymbolKey } from "../shared/constants";

type ChoiceKey = "A" | "B" | "C" | "D" | "E";

const RANDOM_ID_MAX = 10_000_000;

function randInt(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}

/**
 * RandomId inequality pick inside TX, avoiding used IDs.
 */
async function pickRandomQuestionIdTx(params: {
  tx: FirebaseFirestore.Transaction;
  category: string;
  used: Set<string>;
  maxAttempts?: number;
}): Promise<string> {
  const { tx, category, used, maxAttempts = 14 } = params;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const r = randInt(RANDOM_ID_MAX);

    let q = db
      .collection("questions")
      .where("isActive", "==", true)
      .where("category", "==", category)
      .where("randomId", ">=", r)
      .orderBy("randomId", "asc")
      .limit(1);

    let snap = await tx.get(q);

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

export const matchSubmitAnswer = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  const matchId = String(req.data?.matchId ?? "").trim();
  const answer = String(req.data?.answer ?? "").trim() as ChoiceKey;

  if (!matchId) throw new HttpsError("invalid-argument", "matchId required");
  if (!["A", "B", "C", "D", "E"].includes(answer)) {
    throw new HttpsError("invalid-argument", "answer must be one of A/B/C/D/E");
  }

  const matchRef = db.collection("matches").doc(matchId);

  const result = await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found");

    const match = matchSnap.data() as any;

    if (match.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Match not active");
    if (match.turn?.phase !== "QUESTION") throw new HttpsError("failed-precondition", "Not in QUESTION phase");
    if (match.turn?.currentUid !== uid) throw new HttpsError("failed-precondition", "Not your turn");

    const questionId: string | null = match.turn?.activeQuestionId ?? null;
    const symbol: SymbolKey | null = match.turn?.challengeSymbol ?? null;
    const questionIndex: number = Number(match.turn?.questionIndex ?? 0);

    if (!questionId) throw new HttpsError("internal", "activeQuestionId missing");
    if (!symbol) throw new HttpsError("internal", "challengeSymbol missing");
    if (questionIndex !== 1 && questionIndex !== 2) {
      throw new HttpsError("failed-precondition", "Invalid questionIndex (expected 1 or 2)");
    }

    const players: string[] = match.players ?? [];
    if (!Array.isArray(players) || players.length !== 2) {
      throw new HttpsError("failed-precondition", "Match requires exactly 2 players");
    }
    const oppUid = players.find((p) => p !== uid);
    if (!oppUid) throw new HttpsError("internal", "Opponent not found");

    const myState = match.stateByUid?.[uid];
    if (!myState) throw new HttpsError("internal", "Player state missing");

    // Read question
    const qRef = db.collection("questions").doc(questionId);
    const qSnap = await tx.get(qRef);
    if (!qSnap.exists) throw new HttpsError("failed-precondition", "Question doc missing");

    const q = qSnap.data() as any;
    const correctAnswer: ChoiceKey = q.answer;
    const isCorrect = answer === correctAnswer;

    const nextMyState = { ...myState };
    nextMyState.answeredCount = (nextMyState.answeredCount ?? 0) + 1;

    let earnedSymbol: SymbolKey | null = null;

    // used set
    const usedArr: string[] = match.turn?.usedQuestionIds ?? [];
    const usedSet = new Set<string>(usedArr);

    // base turn result (UI feedback)
    const baseResult = {
      uid,
      questionId,
      symbol,
      answer,
      correctAnswer,
      isCorrect,
      earnedSymbol: null as SymbolKey | null,
      at: Date.now(),
      questionIndex,
    };

    // WRONG => pass turn
    if (!isCorrect) {
      nextMyState.wrongCount = (nextMyState.wrongCount ?? 0) + 1;
      nextMyState.lives = Math.max(0, (nextMyState.lives ?? 0) - 1);

      tx.update(matchRef, {
        [`stateByUid.${uid}`]: nextMyState,

        "turn.lastResult": baseResult,
        "turn.phase": "SPIN",
        "turn.currentUid": oppUid, // ✅ pass
        "turn.activeQuestionId": null,

        // chain reset
        "turn.challengeSymbol": null,
        "turn.questionIndex": 0,
      });

      return {
        matchId,
        status: "ACTIVE",
        phase: "SPIN",
        isCorrect: false,
        nextCurrentUid: oppUid,
        questionIndex: 0,
      };
    }

    // CORRECT => keep turn
    nextMyState.points = (nextMyState.points ?? 0) + 1;

    // If Q1 correct => immediately ask Q2 (same category, no spin)
    if (questionIndex === 1) {
      const nextQuestionId = await pickRandomQuestionIdTx({
        tx,
        category: symbol,
        used: usedSet,
        maxAttempts: 14,
      });

      tx.update(matchRef, {
        [`stateByUid.${uid}`]: nextMyState,

        "turn.lastResult": baseResult,
        "turn.phase": "QUESTION",
        "turn.currentUid": uid, // ✅ stay
        "turn.challengeSymbol": symbol, // ✅ same category
        "turn.activeQuestionId": nextQuestionId,
        "turn.usedQuestionIds": [...usedArr, nextQuestionId],
        "turn.questionIndex": 2, // ✅ second question
      });

      return {
        matchId,
        status: "ACTIVE",
        phase: "QUESTION",
        isCorrect: true,
        nextCurrentUid: uid,
        questionIndex: 2,
        symbol,
        questionId: nextQuestionId,
      };
    }

    // If Q2 correct => earn symbol, back to SPIN (still your turn)
    const owned: SymbolKey[] = (nextMyState.symbols ?? []) as SymbolKey[];
    if (!owned.includes(symbol)) {
      nextMyState.symbols = [...owned, symbol];
      earnedSymbol = symbol;
    }

    const symbolsCount = ((nextMyState.symbols ?? []) as SymbolKey[]).length;
    const finished = symbolsCount >= 4;

    const finalResult = { ...baseResult, earnedSymbol };

    tx.update(matchRef, {
      [`stateByUid.${uid}`]: nextMyState,

      "turn.lastResult": finalResult,

      status: finished ? "FINISHED" : "ACTIVE",
      ...(finished ? { winnerUid: uid, endedReason: "ALL_SYMBOLS_OWNED" } : {}),

      "turn.phase": finished ? "END" : "SPIN",
      "turn.currentUid": uid, // ✅ still you (keep going)
      "turn.activeQuestionId": null,

      // chain reset
      "turn.challengeSymbol": null,
      "turn.questionIndex": 0,
    });

    return {
      matchId,
      status: finished ? "FINISHED" : "ACTIVE",
      phase: finished ? "END" : "SPIN",
      isCorrect: true,
      earnedSymbol,
      nextCurrentUid: uid,
      questionIndex: 0,
    };
  });

  return result;
});
