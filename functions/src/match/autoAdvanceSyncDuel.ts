/**
 * Auto-advance Sync Duel questions server-side.
 *
 * Why: Client-driven flow can get stuck in QUESTION_RESULT when both clients leave.
 * This trigger ensures QUESTION_RESULT -> QUESTION_ACTIVE progression without requiring a button click.
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type { MatchDoc } from "../shared/types";
import { FUNCTIONS_REGION } from "../shared/constants";
import { startSyncDuelQuestionTx } from "./syncDuelStart.logic";

export const matchAutoAdvanceSyncDuel = onDocumentUpdated(
  { document: "matches/{matchId}", region: FUNCTIONS_REGION },
  async (event) => {
    const before = event.data?.before.data() as MatchDoc | undefined;
    const after = event.data?.after.data() as MatchDoc | undefined;
    if (!after) return;

    if (after.mode !== "SYNC_DUEL") return;
    if (after.status !== "ACTIVE") return;
    if (!after.syncDuel) return;

    // Only react on transitions into QUESTION_RESULT (or staying there with a newly ended question).
    const beforeStatus = before?.syncDuel?.matchStatus ?? null;
    const afterStatus = after.syncDuel.matchStatus;
    if (afterStatus !== "QUESTION_RESULT") return;

    // If nothing changed, avoid loops.
    if (beforeStatus === "QUESTION_RESULT") {
      const bEndedAt = before?.syncDuel?.questions?.[before.syncDuel.currentQuestionIndex]?.endedAt ?? null;
      const aEndedAt = after.syncDuel.questions?.[after.syncDuel.currentQuestionIndex]?.endedAt ?? null;
      if (bEndedAt === aEndedAt) return;
    }

    const matchId = event.params.matchId as string;
    const matchRef = db.collection("matches").doc(matchId);

    // Small delay helps both clients observe QUESTION_RESULT briefly (UX) and reduces thrash.
    await new Promise((r) => setTimeout(r, 450));

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(matchRef);
        if (!snap.exists) return;

        const match = snap.data() as MatchDoc | undefined;
        if (!match) return;
        if (match.mode !== "SYNC_DUEL") return;
        if (match.status !== "ACTIVE") return;
        if (!match.syncDuel) return;

        // Still in QUESTION_RESULT?
        if (match.syncDuel.matchStatus !== "QUESTION_RESULT") return;

        const nowMs = Date.now();
        await startSyncDuelQuestionTx({ tx, matchRef, match, nowMs });
      });
    } catch (e) {
      // Expected races are fine (another client/trigger already started).
      if (e instanceof HttpsError) return;
      return;
    }
  }
);

