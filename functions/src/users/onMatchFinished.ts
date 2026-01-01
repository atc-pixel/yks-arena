import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { db, FieldValue } from "../utils/firestore";
import { USER_COLLECTION, type UserDoc } from "./types";
import { calcLevelFromTrophies, clampMin } from "./utils";

type MatchStatus = "WAITING" | "ACTIVE" | "FINISHED";

type MatchDoc = {
  status: MatchStatus;
  players?: string[];
  winnerUid?: string;

  stateByUid?: Record<
    string,
    {
      trophies?: number; // match içi kazanılan kupa (soru bazlı)
      wrongCount?: number;
      answeredCount?: number;
      symbols?: string[];
    }
  >;

  progression?: {
    phase1ProcessedAt?: FirebaseFirestore.Timestamp;
  };
};

// Progression settlement: transfer match-earned trophies to user profile.
// Winner gets an additional fixed bonus.
const WIN_BONUS = 25;

function decClamp(n: number) {
  return Math.max(0, Math.floor(n) - 1);
}

export const matchOnFinished = onDocumentUpdated(
  "matches/{matchId}",
  async (event) => {
    const before = event.data?.before.data() as MatchDoc | undefined;
    const after = event.data?.after.data() as MatchDoc | undefined;
    if (!before || !after) return;

    // ONLY ACTIVE -> FINISHED
    if (!(before.status === "ACTIVE" && after.status === "FINISHED")) return;

    const matchRef = event.data!.after.ref;

    const players = after.players ?? [];
    if (players.length !== 2) return;

    const winnerUid = after.winnerUid ?? null;
    if (!winnerUid) return;

    const loserUid = players.find((p) => p !== winnerUid) ?? null;
    if (!loserUid) return;

    const winnerRef = db.collection(USER_COLLECTION).doc(winnerUid);
    const loserRef = db.collection(USER_COLLECTION).doc(loserUid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(matchRef);
      const match = snap.data() as MatchDoc | undefined;
      if (!match) return;

      // idempotency
      if (match.progression?.phase1ProcessedAt) return;

      const stateByUid = match.stateByUid ?? {};
      const winnerState = stateByUid[winnerUid] ?? {};
      const loserState = stateByUid[loserUid] ?? {};

      const winnerMatchKupa = Math.max(0, Math.floor(Number(winnerState.trophies ?? 0)));
      const loserMatchKupa = Math.max(0, Math.floor(Number(loserState.trophies ?? 0)));

      // Transfer rule:
      // - everyone keeps the trophies they earned inside the match
      // - winner also gets a win bonus
      const winnerDelta = winnerMatchKupa + WIN_BONUS;
      const loserDelta = loserMatchKupa;

      const [winnerSnap, loserSnap] = await Promise.all([
        tx.get(winnerRef),
        tx.get(loserRef),
      ]);

      if (!winnerSnap.exists || !loserSnap.exists) {
        tx.update(matchRef, {
          progression: { phase1ProcessedAt: FieldValue.serverTimestamp() },
        });
        return;
      }

      const winnerData = winnerSnap.data() as UserDoc | undefined;
      const loserData = loserSnap.data() as UserDoc | undefined;
      if (!winnerData || !loserData) {
        // User data missing, mark as processed and skip
        tx.update(matchRef, {
          progression: { phase1ProcessedAt: FieldValue.serverTimestamp() },
        });
        return;
      }

      // trophies -> level
      const winnerOldTrophies = Number(winnerData.trophies ?? 0);
      const loserOldTrophies = Number(loserData.trophies ?? 0);

      const winnerNewTrophies = clampMin(winnerOldTrophies + winnerDelta, 0);
      const loserNewTrophies = clampMin(loserOldTrophies + loserDelta, 0);

      const winnerNewLevel = calcLevelFromTrophies(winnerNewTrophies);
      const loserNewLevel = calcLevelFromTrophies(loserNewTrophies);

      // activeMatchCount clamp (never negative)
      const winnerOldActive = Number(winnerData?.presence?.activeMatchCount ?? 0);
      const loserOldActive = Number(loserData?.presence?.activeMatchCount ?? 0);

      const winnerNewActive = decClamp(winnerOldActive);
      const loserNewActive = decClamp(loserOldActive);

      tx.update(winnerRef, {
        trophies: winnerNewTrophies,
        level: winnerNewLevel,
        "stats.totalMatches": FieldValue.increment(1),
        "stats.totalWins": FieldValue.increment(1),
        "league.weeklyScore": FieldValue.increment(winnerDelta),
        "presence.activeMatchCount": winnerNewActive,
      });

      tx.update(loserRef, {
        trophies: loserNewTrophies,
        level: loserNewLevel,
        "stats.totalMatches": FieldValue.increment(1),
        "league.weeklyScore": FieldValue.increment(loserDelta),
        "presence.activeMatchCount": loserNewActive,
      });

      tx.update(matchRef, {
        progression: { phase1ProcessedAt: FieldValue.serverTimestamp() },
      });
    });
  }
);
