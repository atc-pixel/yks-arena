/**
 * onMatchFinished Trigger
 * 
 * Maç bittiğinde (ACTIVE -> FINISHED) tetiklenir.
 * - Oyunculara trophy/level/stats günceller
 * - League bucket'larındaki weeklyTrophies günceller
 * - Teneke Escape: İlk maçını kazananı Bronze'a atar
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { db, FieldValue } from "../utils/firestore";
import { USER_COLLECTION, type UserDoc } from "./types";
import { calcLevelFromTrophies, clampMin } from "./utils";
import { 
  SYSTEM_COLLECTION, 
  LEAGUE_META_DOC_ID, 
  LeagueMetaSchema,
  LEAGUES_COLLECTION,
  type LeaguePlayerEntry,
} from "../shared/types/league";
import { assignToLeague } from "../league/assignToLeague";

// ============================================================================
// TYPES
// ============================================================================

type MatchDoc = {
  status: "WAITING" | "ACTIVE" | "FINISHED";
  players?: string[];
  winnerUid?: string;
  stateByUid?: Record<string, { trophies?: number; wrongCount?: number; answeredCount?: number; symbols?: string[] }>;
  progression?: { phase1ProcessedAt?: FirebaseFirestore.Timestamp };
};

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const WIN_BONUS = 25;

/** n-1 but never negative */
const decClamp = (n: number) => Math.max(0, Math.floor(n) - 1);

/** Safe number conversion: null/undefined -> 0, floor, clamp to 0 */
const safeNum = (val: unknown) => Math.max(0, Math.floor(Number(val ?? 0)));

/** Update a player's weeklyTrophies in bucket players array */
function updatePlayerInBucket(players: LeaguePlayerEntry[], uid: string, delta: number): LeaguePlayerEntry[] {
  return players.map((p) => 
    p.uid === uid ? { ...p, weeklyTrophies: (p.weeklyTrophies || 0) + delta } : p
  );
}

// ============================================================================
// MAIN TRIGGER
// ============================================================================

export const matchOnFinished = onDocumentUpdated("matches/{matchId}", async (event) => {
  const before = event.data?.before.data() as MatchDoc | undefined;
  const after = event.data?.after.data() as MatchDoc | undefined;
  if (!before || !after) return;

  // ONLY trigger on ACTIVE -> FINISHED
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

  // Track values for Teneke Escape (need to pass out of transaction)
  let winnerCurrentLeague = "Teneke";
  let loserCurrentLeague = "Teneke";
  let winnerNewWeeklyTrophies = 0;
  let loserNewWeeklyTrophies = 0;

  // ==================== TRANSACTION ====================
  await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    const match = matchSnap.data() as MatchDoc | undefined;
    if (!match) return;

    // Idempotency: already processed
    if (match.progression?.phase1ProcessedAt) return;

    // Calculate deltas from match state
    const stateByUid = match.stateByUid ?? {};
    const winnerMatchKupa = safeNum(stateByUid[winnerUid]?.trophies);
    const loserMatchKupa = safeNum(stateByUid[loserUid]?.trophies);
    const winnerDelta = winnerMatchKupa + WIN_BONUS;
    const loserDelta = loserMatchKupa;

    // Read user documents
    const [winnerSnap, loserSnap] = await Promise.all([
      tx.get(winnerRef),
      tx.get(loserRef),
    ]);

    // If users don't exist, mark processed and skip
    if (!winnerSnap.exists || !loserSnap.exists) {
      tx.update(matchRef, { progression: { phase1ProcessedAt: FieldValue.serverTimestamp() } });
      return;
    }

    const winnerData = winnerSnap.data() as UserDoc | undefined;
    const loserData = loserSnap.data() as UserDoc | undefined;
    if (!winnerData || !loserData) {
      tx.update(matchRef, { progression: { phase1ProcessedAt: FieldValue.serverTimestamp() } });
      return;
    }

    // ========== READ BUCKET DOCUMENTS ==========
    const winnerBucketId = winnerData.league.currentBucketId || null;
    const loserBucketId = loserData.league.currentBucketId || null;

    let winnerBucketPlayers: LeaguePlayerEntry[] | null = null;
    let loserBucketPlayers: LeaguePlayerEntry[] | null = null;

    // Read winner's bucket
    if (winnerBucketId) {
      const snap = await tx.get(db.collection(LEAGUES_COLLECTION).doc(winnerBucketId));
      if (snap.exists) {
        winnerBucketPlayers = snap.data()?.players || [];
      }
    }

    // Read loser's bucket (or reuse if same)
    if (loserBucketId && loserBucketId !== winnerBucketId) {
      const snap = await tx.get(db.collection(LEAGUES_COLLECTION).doc(loserBucketId));
      if (snap.exists) {
        loserBucketPlayers = snap.data()?.players || [];
      }
    } else if (loserBucketId === winnerBucketId && winnerBucketPlayers) {
      loserBucketPlayers = winnerBucketPlayers; // Same bucket, reuse
    }

    // ========== CALCULATE NEW VALUES ==========
    const winnerOldTrophies = Number(winnerData.trophies ?? 0);
    const loserOldTrophies = Number(loserData.trophies ?? 0);

    const winnerNewTrophies = clampMin(winnerOldTrophies + winnerDelta, 0);
    const loserNewTrophies = clampMin(loserOldTrophies + loserDelta, 0);

    const winnerNewLevel = calcLevelFromTrophies(winnerNewTrophies);
    const loserNewLevel = calcLevelFromTrophies(loserNewTrophies);

    const winnerNewActive = decClamp(Number(winnerData.presence?.activeMatchCount ?? 0));
    const loserNewActive = decClamp(Number(loserData.presence?.activeMatchCount ?? 0));

    // Store for Teneke Escape (must be set before writes)
    winnerCurrentLeague = winnerData.league.currentLeague;
    loserCurrentLeague = loserData.league.currentLeague;
    winnerNewWeeklyTrophies = (winnerData.league.weeklyTrophies ?? 0) + winnerDelta;
    loserNewWeeklyTrophies = (loserData.league.weeklyTrophies ?? 0) + loserDelta;

    // ========== WRITES: UPDATE USER DOCUMENTS ==========
    tx.update(winnerRef, {
      trophies: winnerNewTrophies,
      level: winnerNewLevel,
      "stats.totalMatches": FieldValue.increment(1),
      "stats.totalWins": FieldValue.increment(1),
      "league.weeklyTrophies": FieldValue.increment(winnerDelta),
      "presence.activeMatchCount": winnerNewActive,
    });

    tx.update(loserRef, {
      trophies: loserNewTrophies,
      level: loserNewLevel,
      "stats.totalMatches": FieldValue.increment(1),
      "league.weeklyTrophies": FieldValue.increment(loserDelta),
      "presence.activeMatchCount": loserNewActive,
    });

    // ========== WRITES: UPDATE BUCKET PLAYER ENTRIES ==========
    if (winnerBucketId && winnerBucketId === loserBucketId && winnerBucketPlayers) {
      // Case 1: Both players in same bucket - single update
      let updatedPlayers = updatePlayerInBucket(winnerBucketPlayers, winnerUid, winnerDelta);
      updatedPlayers = updatePlayerInBucket(updatedPlayers, loserUid, loserDelta);
      tx.update(db.collection(LEAGUES_COLLECTION).doc(winnerBucketId), {
        players: updatedPlayers,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // Case 2: Different buckets - update separately
      if (winnerBucketId && winnerBucketPlayers) {
        tx.update(db.collection(LEAGUES_COLLECTION).doc(winnerBucketId), {
          players: updatePlayerInBucket(winnerBucketPlayers, winnerUid, winnerDelta),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (loserBucketId && loserBucketPlayers) {
        tx.update(db.collection(LEAGUES_COLLECTION).doc(loserBucketId), {
          players: updatePlayerInBucket(loserBucketPlayers, loserUid, loserDelta),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // Mark as processed
    tx.update(matchRef, { progression: { phase1ProcessedAt: FieldValue.serverTimestamp() } });
  });

  // ==================== TENEKE ESCAPE (POST-TRANSACTION) ====================
  // Get current season ID from league meta
  const metaSnap = await db.collection(SYSTEM_COLLECTION).doc(LEAGUE_META_DOC_ID).get();
  let seasonId = "S1"; // Default fallback
  if (metaSnap.exists) {
    const meta = LeagueMetaSchema.safeParse(metaSnap.data());
    if (meta.success) {
      seasonId = meta.data.currentSeasonId;
    }
  }

  // Check winner for Teneke Escape
  if (winnerCurrentLeague === "Teneke" && winnerNewWeeklyTrophies > 0) {
    try {
      console.log(`[Teneke Escape] Assigning winner ${winnerUid} to Bronze (weeklyTrophies: ${winnerNewWeeklyTrophies})`);
      const result = await assignToLeague({ uid: winnerUid, seasonId });
      console.log(`[Teneke Escape] Winner ${winnerUid} assigned to ${result.tier} (bucketId: ${result.bucketId})`);
    } catch (error) {
      console.error(`[Teneke Escape] Failed to assign winner ${winnerUid} to league:`, error);
      if (error instanceof Error) {
        console.error(`[Teneke Escape] Error stack:`, error.stack);
      }
    }
  } else {
    console.log(`[Teneke Escape] Winner ${winnerUid} skip: currentLeague=${winnerCurrentLeague}, weeklyTrophies=${winnerNewWeeklyTrophies}`);
  }

  // Check loser for Teneke Escape
  if (loserCurrentLeague === "Teneke" && loserNewWeeklyTrophies > 0) {
    try {
      console.log(`[Teneke Escape] Assigning loser ${loserUid} to Bronze (weeklyTrophies: ${loserNewWeeklyTrophies})`);
      const result = await assignToLeague({ uid: loserUid, seasonId });
      console.log(`[Teneke Escape] Loser ${loserUid} assigned to ${result.tier} (bucketId: ${result.bucketId})`);
    } catch (error) {
      console.error(`[Teneke Escape] Failed to assign loser ${loserUid} to league:`, error);
      if (error instanceof Error) {
        console.error(`[Teneke Escape] Error stack:`, error.stack);
      }
    }
  } else {
    console.log(`[Teneke Escape] Loser ${loserUid} skip: currentLeague=${loserCurrentLeague}, weeklyTrophies=${loserNewWeeklyTrophies}`);
  }
});
