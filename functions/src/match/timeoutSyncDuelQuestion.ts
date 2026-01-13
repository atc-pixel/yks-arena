/**
 * timeoutSyncDuelQuestion Function
 * 
 * 60 saniye timeout olduğunda çağrılır.
 * Sıradaki soruya geçer (QUESTION_RESULT → sonra QUESTION_ACTIVE olacak).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type { MatchDoc, SyncDuelMatchStatus } from "../shared/types";
import { strictParse, TimeoutSyncDuelQuestionInputSchema } from "../shared/validation";

export const matchTimeoutSyncDuelQuestion = onCall(
  { region: "us-central1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

    const { matchId } = strictParse(TimeoutSyncDuelQuestionInputSchema, req.data, "matchTimeoutSyncDuelQuestion");

    const matchRef = db.collection("matches").doc(matchId);
    const nowMs = Date.now();

    await db.runTransaction(async (tx) => {
      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found");

      const match = matchSnap.data() as MatchDoc | undefined;
      if (!match) throw new HttpsError("internal", "Match data invalid");
      if (match.mode !== "SYNC_DUEL") throw new HttpsError("failed-precondition", "Not a sync duel match");
      if (match.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Match not active");

      const syncDuel = match.syncDuel;
      if (!syncDuel) throw new HttpsError("internal", "SyncDuel state missing");
      if (syncDuel.matchStatus !== "QUESTION_ACTIVE") {
        throw new HttpsError("failed-precondition", "Question not active");
      }

      // Aktif soruyu bul
      const currentQuestion = syncDuel.questions[syncDuel.currentQuestionIndex];
      if (!currentQuestion) {
        throw new HttpsError("failed-precondition", "No active question");
      }

      // Timeout kontrolü: 60 saniye geçmiş mi?
      const elapsedMs = nowMs - currentQuestion.serverStartAt;
      if (elapsedMs < 60000) {
        throw new HttpsError("failed-precondition", "Timeout not reached yet");
      }

      // Henüz bitmemişse timeout olarak işaretle
      if (currentQuestion.endedReason === null) {
        const updatedQuestions = [...syncDuel.questions];
        updatedQuestions[syncDuel.currentQuestionIndex] = {
          ...currentQuestion,
          endedReason: "TIMEOUT",
          endedAt: nowMs,
        };

        tx.update(matchRef, {
          "syncDuel.questions": updatedQuestions,
          "syncDuel.matchStatus": "QUESTION_RESULT",
        });
      }
    });

    return { success: true };
  }
);
