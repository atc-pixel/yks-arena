/**
 * startSyncDuelQuestion Function
 * 
 * Sync duel match'inde yeni bir soru başlatır.
 * - Seçilen kategoriden random soru seçer
 * - serverStartAt timestamp'i koyar (server authority)
 * - syncDuel.matchStatus: "QUESTION_ACTIVE" yapar
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import { strictParse, StartSyncDuelRoundInputSchema } from "../shared/validation";
import type { MatchDoc } from "../shared/types";
import { FUNCTIONS_REGION } from "../shared/constants";
import { startSyncDuelQuestionTx } from "./syncDuelStart.logic";

export const matchStartSyncDuelQuestion = onCall(
  { region: FUNCTIONS_REGION },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

    const { matchId } = strictParse(StartSyncDuelRoundInputSchema, req.data, "matchStartSyncDuelQuestion");

    const matchRef = db.collection("matches").doc(matchId);
    const nowMs = Date.now();

    const result = await db.runTransaction(async (tx) => {
      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found");

      const match = matchSnap.data() as MatchDoc | undefined;
      if (!match) throw new HttpsError("internal", "Match data invalid");
      if (match.mode !== "SYNC_DUEL") throw new HttpsError("failed-precondition", "Not a sync duel match");
      if (match.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Match not active");

      return await startSyncDuelQuestionTx({ tx, matchRef, match, nowMs });
    });

    return result;
  }
);
