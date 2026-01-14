import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type { Category, MatchDoc, SyncDuelQuestion } from "../shared/types";

const RANDOM_ID_MAX = 10_000_000;

function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

/**
 * Random ID Inequality pattern inside a transaction.
 * Avoids usedQuestionIds with retries.
 */
export async function pickRandomQuestionIdTx(params: {
  tx: FirebaseFirestore.Transaction;
  category: Category;
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

/**
 * Shared transaction logic: start a new sync duel question.
 * - Idempotent: if already QUESTION_ACTIVE returns current question.
 * - Throws if match finished.
 */
export async function startSyncDuelQuestionTx(params: {
  tx: FirebaseFirestore.Transaction;
  matchRef: FirebaseFirestore.DocumentReference;
  match: MatchDoc;
  nowMs: number;
}): Promise<{ questionId: string; serverStartAt: number }> {
  const { tx, matchRef, match, nowMs } = params;

  const syncDuel = match.syncDuel;
  if (!syncDuel) throw new HttpsError("internal", "SyncDuel state missing");

  if (syncDuel.matchStatus === "QUESTION_ACTIVE") {
    const current = syncDuel.questions[syncDuel.currentQuestionIndex];
    if (!current) {
      throw new HttpsError("internal", "Invariant violated: matchStatus QUESTION_ACTIVE but current question missing");
    }
    return { questionId: current.questionId, serverStartAt: current.serverStartAt };
  }

  const correctCounts = syncDuel.correctCounts ?? {};
  const [uid1, uid2] = match.players;
  if ((correctCounts[uid1] ?? 0) >= 3 || (correctCounts[uid2] ?? 0) >= 3) {
    throw new HttpsError("failed-precondition", "Match already finished");
  }

  const usedQuestionIds = new Set(syncDuel.questions.map((q) => q.questionId));
  const questionId = await pickRandomQuestionIdTx({
    tx,
    category: syncDuel.category,
    used: usedQuestionIds,
  });

  const newQuestionIndex = syncDuel.currentQuestionIndex + 1;

  const newQuestion: SyncDuelQuestion = {
    questionId,
    serverStartAt: nowMs,
    answers: {
      [uid1]: {
        choice: null,
        isCorrect: null,
        clientElapsedMs: null,
        clientLatencyMs: null,
        serverReceiveAt: null,
      },
      [uid2]: {
        choice: null,
        isCorrect: null,
        clientElapsedMs: null,
        clientLatencyMs: null,
        serverReceiveAt: null,
      },
    },
    endedReason: null,
    endedAt: null,
    winnerUid: null,
    pendingWinnerUid: null,
    decisionAt: null,
  };

  tx.update(matchRef, {
    "syncDuel.questions": [...syncDuel.questions, newQuestion],
    "syncDuel.currentQuestionIndex": newQuestionIndex,
    "syncDuel.matchStatus": "QUESTION_ACTIVE",
  });

  return { questionId, serverStartAt: nowMs };
}

