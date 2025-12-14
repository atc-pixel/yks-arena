// functions/src/match/submitAnswer.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import {
  ALL_SYMBOLS,
  CHOICE_KEYS,
  DEFAULT_CATEGORY,
  DEFAULT_LIVES,
  type ChoiceKey,
  type SymbolKey,
} from "../shared/constants";

/**
 * Same optimized random question fetch used after the 1st correct answer (to serve the 2nd streak question).
 */
function genRandomHash(len = 16): string {
  const s = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return s.slice(0, len).padEnd(len, "0");
}

async function pickRandomQuestionIdTx(params: {
  tx: FirebaseFirestore.Transaction;
  category: string;
  used: Set<string>;
  maxAttempts?: number;
}): Promise<string> {
  const { tx, category, used, maxAttempts = 4 } = params;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const r = genRandomHash(16);

    let q = db
      .collection("questions")
      .where("isActive", "==", true)
      .where("category", "==", category)
      .where("randomHash", ">=", r)
      .orderBy("randomHash")
      .limit(1);

    let snap = await tx.get(q);

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

  throw new HttpsError("resource-exhausted", "No unused questions available (random selection retries exhausted).");
}

function otherPlayer(players: string[], uid: string): string {
  return players.find((p) => p !== uid) ?? "";
}

export const matchSubmitAnswer = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  const matchId = String(req.data?.matchId ?? "").trim();
  const answerRaw = String(req.data?.answer ?? "").trim().toUpperCase();

  if (!matchId) throw new HttpsError("invalid-argument", "matchId required");
  if (!CHOICE_KEYS.includes(answerRaw as ChoiceKey)) throw new HttpsError("invalid-argument", "bad answer");

  const answer = answerRaw as ChoiceKey;

  const matchRef = db.collection("matches").doc(matchId);

  const res = await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found");

    const match = matchSnap.data() as any;

    if (match.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Match not active");
    if (match.turn?.phase !== "QUESTION") throw new HttpsError("failed-precondition", "Not in QUESTION phase");
    if (match.turn?.currentUid !== uid) throw new HttpsError("failed-precondition", "Not your turn");

    const players: string[] = match.players ?? [];
    const oppUid = otherPlayer(players, uid);
    if (!oppUid) throw new HttpsError("internal", "Opponent missing");

    const qid: string | null = match.turn?.activeQuestionId ?? null;
    const symbol: SymbolKey | null = match.turn?.challengeSymbol ?? null;
    const streak: 0 | 1 = match.turn?.streak ?? 0;

    if (!qid || !symbol) throw new HttpsError("internal", "Turn missing question/symbol");

    // Read the single active question doc (1 read)
    const qRef = db.collection("questions").doc(qid);
    const qSnap = await tx.get(qRef);
    if (!qSnap.exists) throw new HttpsError("internal", "Question missing");

    const q = qSnap.data() as any;
    const isCorrect = q.answer === answer;

    // Player states
    const stateByUid = { ...(match.stateByUid ?? {}) };

    const my = {
      lives: DEFAULT_LIVES,
      points: 0,
      symbols: [] as SymbolKey[],
      wrongCount: 0,
      answeredCount: 0, // still tracked for stats/UI if you want
      ...(stateByUid[uid] ?? {}),
    };

    const opp = {
      lives: DEFAULT_LIVES,
      points: 0,
      symbols: [] as SymbolKey[],
      wrongCount: 0,
      answeredCount: 0,
      ...(stateByUid[oppUid] ?? {}),
    };

    my.answeredCount = (my.answeredCount ?? 0) + 1;

    // Used question tracking
    const usedArr: string[] = match.turn?.usedQuestionIds ?? [];
    const usedSet = new Set<string>(usedArr);

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

      return { matchId, status: "ACTIVE" as const, phase: "SPIN" as const };
    }

    // Correct
    const nextStreak = streak === 0 ? 1 : 2;

    if (nextStreak === 1) {
      // Serve 2nd question for the same symbol (still same player)
      const nextQid = await pickRandomQuestionIdTx({
        tx,
        category: DEFAULT_CATEGORY,
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

      return { matchId, status: "ACTIVE" as const, phase: "QUESTION" as const };
    }

    // nextStreak === 2 -> win symbol
    const owned: SymbolKey[] = (my.symbols ?? []) as SymbolKey[];
    const newOwned = owned.includes(symbol) ? owned : [...owned, symbol];
    my.symbols = newOwned;

    const hasAllSymbols = ALL_SYMBOLS.every((s) => newOwned.includes(s));

    // ✅ Perfect Run Fix:
    // No longer tied to answeredCount === 8
    const isPerfect = hasAllSymbols && (my.wrongCount ?? 0) === 0;

    if (hasAllSymbols) {
      // MVP scoring:
      my.points = (my.points ?? 0) + 10;

      if (!isPerfect) {
        opp.lives = Math.max(0, (opp.lives ?? DEFAULT_LIVES) - 1);
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

      return { matchId, status: "FINISHED" as const, phase: "SPIN" as const };
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

    return { matchId, status: "ACTIVE" as const, phase: "SPIN" as const };
  });

  return res;
});
