import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type {
  ChoiceKey,
  MatchDoc,
  QuestionDoc,
  SyncDuelMatchStatus,
  SyncDuelQuestion,
} from "../shared/types";

// Deterministic hash function (retry-safe, Math.random yok)
export function hashStringToInt(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Elo yokken deterministic 0..5 kupa.
 * Retry olursa değişmesin diye Math.random yok.
 */
export function calcKupaForCorrectAnswer(params: {
  matchId: string;
  questionId: string;
  uid: string;
}): number {
  const seed = hashStringToInt(`${params.matchId}:${params.questionId}:${params.uid}`);
  return seed % 6; // 0..5
}

export async function applySyncDuelAnswerTx(params: {
  tx: FirebaseFirestore.Transaction;
  matchRef: FirebaseFirestore.DocumentReference;
  matchId: string;
  match: MatchDoc;
  uid: string;
  answer: ChoiceKey;
  clientElapsedMs: number;
  serverReceiveAt: number;
}): Promise<void> {
  const { tx, matchRef, matchId, match, uid, answer, clientElapsedMs, serverReceiveAt } = params;

  if (match.mode !== "SYNC_DUEL") throw new HttpsError("failed-precondition", "Not a sync duel match");
  if (match.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Match not active");

  const syncDuel = match.syncDuel;
  if (!syncDuel) throw new HttpsError("internal", "SyncDuel state missing");
  if (syncDuel.matchStatus !== "QUESTION_ACTIVE") {
    throw new HttpsError("failed-precondition", "Question not active");
  }

  const currentQuestion = syncDuel.questions[syncDuel.currentQuestionIndex];
  if (!currentQuestion) throw new HttpsError("failed-precondition", "No active question");

  if (currentQuestion.answers[uid]?.choice !== null) {
    throw new HttpsError("failed-precondition", "Already answered");
  }

  const questionRef = db.collection("questions").doc(currentQuestion.questionId);
  const questionSnap = await tx.get(questionRef);
  if (!questionSnap.exists) throw new HttpsError("internal", "Question missing");

  const question = questionSnap.data() as QuestionDoc | undefined;
  if (!question) throw new HttpsError("internal", "Question data invalid");

  const correctAnswer: ChoiceKey = question.answer;
  const isCorrect = answer === correctAnswer;

  const updatedAnswers: SyncDuelQuestion["answers"] = {
    ...currentQuestion.answers,
    [uid]: {
      choice: answer,
      isCorrect,
      clientElapsedMs,
      serverReceiveAt,
    },
  };

  const updatedQuestion: SyncDuelQuestion = {
    ...currentQuestion,
    answers: updatedAnswers,
  };

  const [uid1, uid2] = match.players;

  if (isCorrect) {
    const kupaAwarded = calcKupaForCorrectAnswer({
      matchId,
      questionId: currentQuestion.questionId,
      uid,
    });

    const currentTrophies = match.stateByUid[uid]?.trophies ?? 0;
    const updatedCorrectCounts = { ...syncDuel.correctCounts };
    updatedCorrectCounts[uid] = (updatedCorrectCounts[uid] ?? 0) + 1;

    const updatedRoundWins = { ...(syncDuel.roundWins ?? {}) };
    updatedRoundWins[uid] = (updatedRoundWins[uid] ?? 0) + 1;

    let matchStatus: SyncDuelMatchStatus = "QUESTION_RESULT";
    let finalWinnerUid: string | undefined;

    if (updatedCorrectCounts[uid] >= 3) {
      matchStatus = "MATCH_FINISHED";
      finalWinnerUid = uid;
    }

    updatedQuestion.endedReason = "CORRECT";
    updatedQuestion.endedAt = serverReceiveAt;

    const updatedQuestions = [...syncDuel.questions];
    updatedQuestions[syncDuel.currentQuestionIndex] = updatedQuestion;

    tx.update(matchRef, {
      "syncDuel.questions": updatedQuestions,
      "syncDuel.correctCounts": updatedCorrectCounts,
      "syncDuel.roundWins": updatedRoundWins,
      "syncDuel.matchStatus": matchStatus,
      [`stateByUid.${uid}.trophies`]: currentTrophies + kupaAwarded,
      ...(finalWinnerUid !== undefined && { winnerUid: finalWinnerUid }),
      ...(matchStatus === "MATCH_FINISHED" && { status: "FINISHED" }),
    });

    return;
  }

  // Wrong answer branch
  const otherUid = uid === uid1 ? uid2 : uid1;
  const otherAnswer = updatedAnswers[otherUid];

  // 2 wrong answers total -> advance
  if (otherAnswer?.choice !== null && otherAnswer?.isCorrect === false) {
    updatedQuestion.endedReason = "TWO_WRONG";
    updatedQuestion.endedAt = serverReceiveAt;

    const updatedQuestions = [...syncDuel.questions];
    updatedQuestions[syncDuel.currentQuestionIndex] = updatedQuestion;

    tx.update(matchRef, {
      "syncDuel.questions": updatedQuestions,
      "syncDuel.matchStatus": "QUESTION_RESULT",
    });
    return;
  }

  // Only this player's wrong answer; keep QUESTION_ACTIVE
  const updatedQuestions = [...syncDuel.questions];
  updatedQuestions[syncDuel.currentQuestionIndex] = updatedQuestion;

  tx.update(matchRef, {
    "syncDuel.questions": updatedQuestions,
  });
}

