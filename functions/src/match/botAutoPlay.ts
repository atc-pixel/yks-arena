/**
 * Bot Auto Play (Sync Duel)
 *
 * When a SYNC_DUEL match has a BOT player and a question becomes active,
 * bot answers after a deterministic (retry-safe) delay with difficulty-based accuracy.
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type { ChoiceKey, MatchDoc, QuestionDoc } from "../shared/types";
import { applySyncDuelAnswerTx, hashStringToInt } from "./syncDuel.engine";

const CHOICES: ChoiceKey[] = ["A", "B", "C", "D", "E"];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapDifficultyToPCorrect(botDifficulty: number): number {
  const d = clamp(Math.floor(botDifficulty || 5), 1, 10);
  // 1 -> 0.35, 10 -> 0.92 (linear)
  return 0.35 + ((d - 1) * (0.92 - 0.35)) / 9;
}

function pickBotAnswer(params: {
  seed: number;
  botDifficulty: number;
  correctAnswer: ChoiceKey;
}): { answer: ChoiceKey; delayMs: number } {
  const { seed, botDifficulty, correctAnswer } = params;

  const d = clamp(Math.floor(botDifficulty || 5), 1, 10);
  const pCorrect = mapDifficultyToPCorrect(d);
  const r = (seed % 10_000) / 10_000;

  // delay: difficulty yükseldikçe hızlansın, seed ile jitter
  const base = clamp(6500 - d * 450, 1200, 6500);
  const jitter = seed % 800; // 0..799
  const delayMs = clamp(base + jitter, 1200, 7000);

  if (r < pCorrect) {
    return { answer: correctAnswer, delayMs };
  }

  const others = CHOICES.filter((c) => c !== correctAnswer);
  const idx = ((seed >> 8) >>> 0) % others.length;
  return { answer: others[idx], delayMs };
}

export const matchBotAutoPlay = onDocumentUpdated(
  { document: "matches/{matchId}", region: "us-central1" },
  async (event) => {
    const after = event.data?.after.data() as MatchDoc | undefined;
    if (!after) return;

    if (after.mode !== "SYNC_DUEL") return;
    if (after.status !== "ACTIVE") return;

    const matchId = event.params.matchId as string;

    const syncDuel = after.syncDuel;
    if (!syncDuel) return;
    if (syncDuel.matchStatus !== "QUESTION_ACTIVE") return;

    const playerTypes = after.playerTypes ?? {};
    const botUid = Object.keys(playerTypes).find((uid) => playerTypes[uid] === "BOT") ?? null;
    if (!botUid) return;

    const currentQuestion = syncDuel.questions[syncDuel.currentQuestionIndex];
    if (!currentQuestion) return;

    // If bot already answered, no-op
    if (currentQuestion.answers?.[botUid]?.choice !== null) return;

    // Read bot difficulty (outside TX ok)
    const botSnap = await db.collection("bot_pool").doc(botUid).get();
    const botDifficulty = Number(botSnap.data()?.botDifficulty ?? 5);

    // Read question correct answer (outside TX ok; we re-check match state in TX after delay)
    const qSnap = await db.collection("questions").doc(currentQuestion.questionId).get();
    if (!qSnap.exists) return;
    const q = qSnap.data() as QuestionDoc | undefined;
    if (!q) return;

    const correctAnswer = q.answer as ChoiceKey;
    const seed = hashStringToInt(`${matchId}:${currentQuestion.questionId}:${botUid}`);
    const { answer, delayMs } = pickBotAnswer({ seed, botDifficulty, correctAnswer });

    await sleep(delayMs);

    const matchRef = db.collection("matches").doc(matchId);
    const serverReceiveAt = Date.now();

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(matchRef);
        if (!snap.exists) return;

        const match = snap.data() as MatchDoc | undefined;
        if (!match) return;
        if (match.status !== "ACTIVE") return;
        if (match.mode !== "SYNC_DUEL") return;

        const sd = match.syncDuel;
        if (!sd) return;
        if (sd.matchStatus !== "QUESTION_ACTIVE") return;

        const cq = sd.questions[sd.currentQuestionIndex];
        if (!cq) return;
        if (cq.questionId !== currentQuestion.questionId) return; // question moved on
        if (cq.answers?.[botUid]?.choice !== null) return; // already answered

        // Apply using shared engine (ensures same rules as humans)
        await applySyncDuelAnswerTx({
          tx,
          matchRef,
          matchId,
          match,
          uid: botUid,
          answer,
          clientElapsedMs: delayMs,
          serverReceiveAt,
        });
      });
    } catch (e) {
      // Expected races are fine: already answered, question not active, etc.
      if (e instanceof HttpsError) return;
      return;
    }
  }
);

