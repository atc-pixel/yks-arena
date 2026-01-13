/**
 * finalizeSyncDuelDecision Function (Cleanup / Fallback)
 *
 * Grace window pending state'i finalize eder.
 * - Normal durumda 2. doğru cevap grace içindeyse submitAnswer TX içinde karar verilir.
 * - Bu callable sadece 2. doğru cevap hiç gelmezse (veya client gecikirse) pending'i temizlemek için kullanılır.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type { MatchDoc, SyncDuelQuestionAnswer } from "../shared/types";
import { strictParse, FinalizeSyncDuelDecisionInputSchema } from "../shared/validation";
import { FUNCTIONS_REGION } from "../shared/constants";
import { calcKupaForCorrectAnswer } from "./syncDuel.engine";

const GRACE_MS = 300;
const LATENCY_CAP_MS = 200;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function capClientLatencyMs(latencyMs: unknown): number {
  if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs)) return 0;
  return clamp(Math.round(latencyMs), 0, LATENCY_CAP_MS);
}

function pickWinnerUid(params: {
  pendingWinnerUid: string;
  challengerUid: string;
  pending: SyncDuelQuestionAnswer | undefined;
  challenger: { clientElapsedMs: number; serverReceiveAt: number; clientLatencyMs: number | null };
  decisionAt: number;
}): string {
  const { pendingWinnerUid, challengerUid, pending, challenger, decisionAt } = params;
  const pendingReceiveAt = pending?.serverReceiveAt ?? null;
  const pendingClientElapsedMs = pending?.clientElapsedMs ?? null;
  const pendingClientLatencyMs = pending?.clientLatencyMs ?? null;

  // challenger within grace window
  if (challenger.serverReceiveAt < decisionAt && pendingReceiveAt !== null) {
    // primary: effective receive time (serverReceiveAt - capped clientLatencyMs)
    const pendingEffective = pendingReceiveAt - capClientLatencyMs(pendingClientLatencyMs);
    const challengerEffective = challenger.serverReceiveAt - capClientLatencyMs(challenger.clientLatencyMs);
    if (challengerEffective < pendingEffective) return challengerUid;
    if (challengerEffective > pendingEffective) return pendingWinnerUid;

    const a = pendingClientElapsedMs;
    const b = challenger.clientElapsedMs;
    const aOk = typeof a === "number" && a >= 0 && a <= 60000;
    const bOk = typeof b === "number" && b >= 0 && b <= 60000;
    if (aOk && bOk) return b < a ? challengerUid : pendingWinnerUid;
  }

  return pendingWinnerUid;
}

export const matchFinalizeSyncDuelDecision = onCall(
  { region: FUNCTIONS_REGION },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

    const { matchId } = strictParse(
      FinalizeSyncDuelDecisionInputSchema,
      req.data,
      "matchFinalizeSyncDuelDecision"
    );

    const matchRef = db.collection("matches").doc(matchId);
    const nowMs = Date.now();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists) throw new HttpsError("not-found", "Match not found");

      const match = snap.data() as MatchDoc | undefined;
      if (!match) throw new HttpsError("internal", "Match data invalid");
      if (match.mode !== "SYNC_DUEL") throw new HttpsError("failed-precondition", "Not a sync duel match");
      if (match.status !== "ACTIVE") return; // already finished/cancelled

      const sd = match.syncDuel;
      if (!sd) throw new HttpsError("internal", "SyncDuel state missing");
      if (sd.matchStatus !== "QUESTION_ACTIVE") return; // already decided

      const cq = sd.questions[sd.currentQuestionIndex];
      if (!cq) throw new HttpsError("failed-precondition", "No active question");
      if (cq.endedReason !== null) return;

      const pendingWinnerUid = cq.pendingWinnerUid ?? null;
      const decisionAt = cq.decisionAt ?? null;
      if (!pendingWinnerUid || typeof decisionAt !== "number") return;

      // Decision time reached?
      if (nowMs < decisionAt) {
        throw new HttpsError("failed-precondition", "Decision time not reached yet");
      }

      const [uid1, uid2] = match.players;
      const a1 = cq.answers?.[uid1];
      const a2 = cq.answers?.[uid2];

      // If both are correct, pick winner (rare here; normally submitAnswer handles it)
      let winnerUid = pendingWinnerUid;
      const uid1Correct = a1?.isCorrect === true && typeof a1.serverReceiveAt === "number";
      const uid2Correct = a2?.isCorrect === true && typeof a2.serverReceiveAt === "number";

      if (uid1Correct && uid2Correct) {
        // Normalize: pendingWinnerUid is the first correct by design, but keep generic.
        const challengerUid = uid1 === pendingWinnerUid ? uid2 : uid1;
        const pendingAns = cq.answers?.[pendingWinnerUid];
        const challengerAns = cq.answers?.[challengerUid];
        const challenger = {
          clientElapsedMs: typeof challengerAns?.clientElapsedMs === "number" ? challengerAns.clientElapsedMs : GRACE_MS,
          clientLatencyMs: typeof challengerAns?.clientLatencyMs === "number" ? challengerAns.clientLatencyMs : null,
          serverReceiveAt: challengerAns?.serverReceiveAt ?? nowMs,
        };
        winnerUid = pickWinnerUid({
          pendingWinnerUid,
          challengerUid,
          pending: pendingAns,
          challenger,
          decisionAt,
        });
      }

      const kupaAwarded = calcKupaForCorrectAnswer({
        matchId,
        questionId: cq.questionId,
        uid: winnerUid,
      });

      const currentTrophies = match.stateByUid[winnerUid]?.trophies ?? 0;
      const updatedCorrectCounts = { ...(sd.correctCounts ?? {}) };
      updatedCorrectCounts[winnerUid] = (updatedCorrectCounts[winnerUid] ?? 0) + 1;

      const updatedRoundWins = { ...(sd.roundWins ?? {}) };
      updatedRoundWins[winnerUid] = (updatedRoundWins[winnerUid] ?? 0) + 1;

      let matchStatus: MatchDoc["syncDuel"]["matchStatus"] = "QUESTION_RESULT";
      let finalWinnerUid: string | undefined;
      if ((updatedCorrectCounts[winnerUid] ?? 0) >= 3) {
        matchStatus = "MATCH_FINISHED";
        finalWinnerUid = winnerUid;
      }

      const updatedQuestions = [...sd.questions];
      updatedQuestions[sd.currentQuestionIndex] = {
        ...cq,
        endedReason: "CORRECT",
        endedAt: nowMs,
        winnerUid,
        pendingWinnerUid: null,
        decisionAt: null,
      };

      tx.update(matchRef, {
        "syncDuel.questions": updatedQuestions,
        "syncDuel.correctCounts": updatedCorrectCounts,
        "syncDuel.roundWins": updatedRoundWins,
        "syncDuel.matchStatus": matchStatus,
        [`stateByUid.${winnerUid}.trophies`]: currentTrophies + kupaAwarded,
        ...(finalWinnerUid !== undefined && { winnerUid: finalWinnerUid }),
        ...(matchStatus === "MATCH_FINISHED" && { status: "FINISHED" }),
      });
    });

    return { success: true };
  }
);

