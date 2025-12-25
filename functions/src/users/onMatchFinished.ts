// functions/src/users/onMatchFinished.ts

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { db, FieldValue } from "../utils/firestore";
import { USER_COLLECTION } from "./types";
import { calcLevelFromTrophies, clampMin } from "./utils";

type MatchStatus = "WAITING" | "ACTIVE" | "FINISHED";

type MatchDoc = {
  status: MatchStatus;
  players?: string[];
  winnerUid?: string;

  // We now treat this as "match kupa earned from correct answers"
  stateByUid?: Record<
    string,
    {
      lives?: number;
      trophies?: number; // <-- IMPORTANT: renamed from points to trophies in match engine
      wrongCount?: number;
      answeredCount?: number;
      symbols?: string[];
    }
  >;

  // Idempotency marker for Phase 1
  progression?: {
    phase1ProcessedAt?: FirebaseFirestore.Timestamp;
  };
};

function computeTrophyDeltaFromMatchKupa(params: {
  isWinner: boolean;
  myMatchKupa: number; // stateByUid.{uid}.trophies
}): number {
  const { isWinner, myMatchKupa } = params;
  const kupa = Math.max(0, Math.floor(myMatchKupa || 0));

  if (isWinner) {
    // Winner: 25..32 (kupa 0..21 -> bonus 0..7)
    const bonus = Math.min(7, Math.floor(kupa / 3));
    return 25 + bonus; // 25..32
  }

  // Loser: -2..+5 (kupa 0..21 -> -2..+5)
  const value = -2 + Math.min(7, Math.floor(kupa / 3)); // -2..+5 (cap)
  return Math.min(5, value);
}

export const matchOnFinished = onDocumentUpdated(
  "matches/{matchId}",
  async (event) => {
    const before = event.data?.before.data() as MatchDoc | undefined;
    const after = event.data?.after.data() as MatchDoc | undefined;

    if (!before || !after) return;

    // ONLY on ACTIVE -> FINISHED
    if (!(before.status === "ACTIVE" && after.status === "FINISHED")) return;

    const matchId = event.params.matchId as string;
    const winnerUid = after.winnerUid;
    const players = after.players ?? [];

    if (!winnerUid) return;
    if (!players.length) return;

    // 1v1 assumption (current engine)
    const loserUid = players.find((p) => p !== winnerUid);
    if (!loserUid) return;

    const matchRef = event.data!.after.ref;
    const winnerRef = db.collection(USER_COLLECTION).doc(winnerUid);
    const loserRef = db.collection(USER_COLLECTION).doc(loserUid);

    await db.runTransaction(async (tx) => {
      // Re-read match inside txn for idempotency
      const matchSnap = await tx.get(matchRef);
      const match = matchSnap.data() as MatchDoc | undefined;
      if (!match) return;

      // If already processed, bail out (retry safe)
      if (match.progression?.phase1ProcessedAt) return;

      const stateByUid = match.stateByUid ?? {};
      const winnerState = stateByUid[winnerUid] ?? {};
      const loserState = stateByUid[loserUid] ?? {};

      const winnerMatchKupa = Number(winnerState.trophies ?? 0);
      const loserMatchKupa = Number(loserState.trophies ?? 0);

      const winnerDelta = computeTrophyDeltaFromMatchKupa({
        isWinner: true,
        myMatchKupa: winnerMatchKupa,
      });

      const loserDelta = computeTrophyDeltaFromMatchKupa({
        isWinner: false,
        myMatchKupa: loserMatchKupa,
      });

      // Fetch user docs to compute new totals + level
      const [winnerSnap, loserSnap] = await Promise.all([
        tx.get(winnerRef),
        tx.get(loserRef),
      ]);

      if (!winnerSnap.exists || !loserSnap.exists) {
        // If user doc missing, mark match processed to avoid infinite retries
        tx.update(matchRef, {
          progression: { phase1ProcessedAt: FieldValue.serverTimestamp() },
        });
        return;
      }

      const winnerData = winnerSnap.data() as any;
      const loserData = loserSnap.data() as any;

      const winnerOldTrophies = Number(winnerData.trophies ?? 0);
      const loserOldTrophies = Number(loserData.trophies ?? 0);

      const winnerNewTrophies = clampMin(winnerOldTrophies + winnerDelta, 0);
      const loserNewTrophies = clampMin(loserOldTrophies + loserDelta, 0);

      const winnerNewLevel = calcLevelFromTrophies(winnerNewTrophies);
      const loserNewLevel = calcLevelFromTrophies(loserNewTrophies);

      // Winner updates
      tx.update(winnerRef, {
        trophies: winnerNewTrophies,
        level: winnerNewLevel,
        "stats.totalMatches": FieldValue.increment(1),
        "stats.totalWins": FieldValue.increment(1),
        "league.weeklyScore": FieldValue.increment(winnerDelta), // weekly competition for Phase 3
      });

      // Loser updates
      tx.update(loserRef, {
        trophies: loserNewTrophies,
        level: loserNewLevel,
        "stats.totalMatches": FieldValue.increment(1),
        "league.weeklyScore": FieldValue.increment(loserDelta),
      });

      // Mark match processed (idempotency)
      tx.update(matchRef, {
        progression: { phase1ProcessedAt: FieldValue.serverTimestamp() },
      });
    });
  }
);
