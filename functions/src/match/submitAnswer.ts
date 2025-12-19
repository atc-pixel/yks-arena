// functions/src/match/submitAnswer.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type { SymbolKey } from "../shared/constants";

type ChoiceKey = "A" | "B" | "C" | "D" | "E";

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

    if (!questionId) throw new HttpsError("internal", "activeQuestionId missing");
    if (!symbol) throw new HttpsError("internal", "challengeSymbol missing");

    const players: string[] = match.players ?? [];
    if (!Array.isArray(players) || players.length !== 2) {
      throw new HttpsError("failed-precondition", "Match requires exactly 2 players");
    }
    const oppUid = players.find((p) => p !== uid);
    if (!oppUid) throw new HttpsError("internal", "Opponent not found");

    const myState = match.stateByUid?.[uid];
    const oppState = match.stateByUid?.[oppUid];
    if (!myState || !oppState) throw new HttpsError("internal", "Player state missing");

    // Read question
    const qRef = db.collection("questions").doc(questionId);
    const qSnap = await tx.get(qRef);
    if (!qSnap.exists) throw new HttpsError("failed-precondition", "Question doc missing");

    const q = qSnap.data() as any;
    const correctAnswer: ChoiceKey = q.answer;
    const isCorrect = answer === correctAnswer;

    // Apply scoring rules (clean + deterministic)
    const nextMyState = { ...myState };
    nextMyState.answeredCount = (nextMyState.answeredCount ?? 0) + 1;

    let earnedSymbol: SymbolKey | null = null;

    if (isCorrect) {
      nextMyState.points = (nextMyState.points ?? 0) + 1;

      // streak increments on correct
      const prevStreak = Number(match.turn?.streak ?? 0);
      const nextStreak = prevStreak + 1;

      // RULE: 2 doğru üst üste => sembol kazan
      // (İstersen 3 yaparız; ama şimdilik hızlı oynanır.)
      if (nextStreak >= 2) {
        const owned: SymbolKey[] = (nextMyState.symbols ?? []) as SymbolKey[];
        if (!owned.includes(symbol)) {
          nextMyState.symbols = [...owned, symbol];
          earnedSymbol = symbol;
        }
        // streak reset after “award attempt”
        match.turn.streak = 0;
      } else {
        match.turn.streak = nextStreak;
      }
    } else {
      nextMyState.wrongCount = (nextMyState.wrongCount ?? 0) + 1;
      nextMyState.lives = Math.max(0, (nextMyState.lives ?? 0) - 1);

      // streak resets on wrong
      match.turn.streak = 0;
    }

    // End condition: lives hit 0
    let newStatus: "ACTIVE" | "FINISHED" = "ACTIVE";
    let winnerUid: string | null = null;
    if (!isCorrect && nextMyState.lives <= 0) {
      newStatus = "FINISHED";
      winnerUid = oppUid;
    }

    // Turn result: UI bunu gösterecek (altın standart)
    const turnResult = {
      uid,
      questionId,
      symbol,
      answer,
      correctAnswer,
      isCorrect,
      earnedSymbol,
      at: Date.now(), // client display için yeterli; server timestamp şart değil
    };

    // Advance turn (whether correct or wrong) unless finished
    const update: any = {
      status: newStatus,
      ...(winnerUid ? { winnerUid, endedReason: "LIVES_ZERO" } : {}),
      [`stateByUid.${uid}`]: nextMyState,

      // clear question
      "turn.phase": newStatus === "FINISHED" ? "END" : "SPIN",
      "turn.activeQuestionId": null,
      "turn.challengeSymbol": null,

      // rotate turn if still active
      ...(newStatus === "ACTIVE" ? { "turn.currentUid": oppUid } : {}),

      // persist last result for UI
      "turn.lastResult": turnResult,
    };

    tx.update(matchRef, update);

    return {
      matchId,
      status: newStatus,
      phase: update["turn.phase"],
      isCorrect,
      earnedSymbol,
      lives: nextMyState.lives,
      points: nextMyState.points,
    };
  });

  return result;
});
