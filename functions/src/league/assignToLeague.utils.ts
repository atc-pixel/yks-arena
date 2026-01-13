/**
 * Helper functions for assignToLeague
 * 
 * Architecture Decision:
 * - Helper functions extracted to keep assignToLeague.ts clean and focused
 * - All helpers are transaction-aware (receive tx parameter)
 */

import { db, FieldValue, Timestamp } from "../utils/firestore";
import {
  LeagueBucketSchema,
  LeagueMetaSchema,
  LeaguePlayerEntrySchema,
  type LeagueBucket,
  type LeagueMeta,
  type LeaguePlayerEntry,
  type LeagueTier,
  LEAGUES_COLLECTION,
  SYSTEM_COLLECTION,
  LEAGUE_META_DOC_ID,
  generateBucketId,
} from "../shared/types/league";

/**
 * Find an open bucket for the given tier
 */
export async function findOpenBucket(
  tx: FirebaseFirestore.Transaction,
  tier: LeagueTier,
  seasonId: string
): Promise<string | null> {
  const metaRef = db.collection(SYSTEM_COLLECTION).doc(LEAGUE_META_DOC_ID);
  const metaSnap = await tx.get(metaRef);
  
  if (!metaSnap.exists) {
    return null;
  }

  const metaData = metaSnap.data();
  const meta = LeagueMetaSchema.parse(metaData);

  const openBucketIds = meta.openBuckets[tier] || [];

  for (const bucketId of openBucketIds) {
    const bucketRef = db.collection(LEAGUES_COLLECTION).doc(bucketId);
    const bucketSnap = await tx.get(bucketRef);

    if (!bucketSnap.exists) {
      continue;
    }

    const bucketData = bucketSnap.data();
    const bucket = LeagueBucketSchema.parse(bucketData);

    if (
      bucket.seasonId === seasonId &&
      bucket.status === "active" &&
      bucket.players.length < 30
    ) {
      return bucketId;
    }
  }

  return null;
}

/**
 * Create a new bucket for the given tier
 */
export async function createNewBucket(
  tx: FirebaseFirestore.Transaction,
  tier: LeagueTier,
  seasonId: string
): Promise<string> {
  const metaRef = db.collection(SYSTEM_COLLECTION).doc(LEAGUE_META_DOC_ID);
  const metaSnap = await tx.get(metaRef);

  let bucketNumber = 1;

  if (metaSnap.exists) {
    const metaData = metaSnap.data();
    const meta = LeagueMetaSchema.parse(metaData);

    const existingBuckets = meta.openBuckets[tier] || [];
    let maxBucketNumber = 0;

    for (const bucketId of existingBuckets) {
      const parsed = bucketId.split("_");
      if (parsed.length === 3 && parsed[1] === seasonId) {
        const num = parseInt(parsed[2], 10);
        if (!isNaN(num) && num > maxBucketNumber) {
          maxBucketNumber = num;
        }
      }
    }

    bucketNumber = maxBucketNumber + 1;
  }

  const bucketId = generateBucketId(tier, seasonId, bucketNumber);
  const bucketRef = db.collection(LEAGUES_COLLECTION).doc(bucketId);

  const now = Timestamp.now();
  const newBucket: Omit<LeagueBucket, "players"> & {
    players: LeaguePlayerEntry[];
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
  } = {
    tier,
    seasonId,
    bucketNumber,
    status: "active",
    players: [],
    createdAt: now,
    updatedAt: now,
  };

  tx.create(bucketRef, newBucket);

  return bucketId;
}

/**
 * Update league meta openBuckets cache
 */
export async function updateLeagueMeta(
  tx: FirebaseFirestore.Transaction,
  tier: LeagueTier,
  bucketId: string,
  seasonId: string
): Promise<void> {
  const metaRef = db.collection(SYSTEM_COLLECTION).doc(LEAGUE_META_DOC_ID);
  const metaSnap = await tx.get(metaRef);

  if (!metaSnap.exists) {
    const now = Timestamp.now();
    const newMeta: Omit<LeagueMeta, "lastResetAt"> & {
      openBuckets: Record<LeagueTier, string[]>;
      currentSeasonId: string;
      lastResetAt: null;
      updatedAt: FirebaseFirestore.Timestamp;
    } = {
      openBuckets: {
        Teneke: [],
        Bronze: [bucketId],
        Silver: [],
        Gold: [],
        Platinum: [],
        Diamond: [],
      },
      currentSeasonId: seasonId,
      lastResetAt: null,
      updatedAt: now,
    };
    tx.create(metaRef, newMeta);
    return;
  }

  const metaData = metaSnap.data();
  const meta = LeagueMetaSchema.parse(metaData);

  const currentOpenBuckets = meta.openBuckets[tier] || [];
  if (!currentOpenBuckets.includes(bucketId)) {
    currentOpenBuckets.push(bucketId);
  }

  tx.update(metaRef, {
    [`openBuckets.${tier}`]: currentOpenBuckets,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Remove user from old bucket
 * 
 * Refactor: Optimized for O(1) lookup and idempotency
 * - Direct bucket lookup using oldBucketId instead of O(N) collection scan
 * - Silently returns if oldBucketId is empty or document doesn't exist
 */
export async function removeUserFromOldBucket(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  oldBucketId: string
): Promise<void> {
  // Silently return if oldBucketId is empty
  if (!oldBucketId) {
    return;
  }

  const oldBucketRef = db.collection(LEAGUES_COLLECTION).doc(oldBucketId);
  const oldBucketSnap = await tx.get(oldBucketRef);

  // Silently return if document doesn't exist
  if (!oldBucketSnap.exists) {
    return;
  }

  const oldBucketData = oldBucketSnap.data();
  const oldBucket = LeagueBucketSchema.safeParse(oldBucketData);

  if (!oldBucket.success) {
    return;
  }

  const playerIndex = oldBucket.data.players.findIndex((p) => p.uid === uid);
  
  // User not in this bucket, nothing to do
  if (playerIndex === -1) {
    return;
  }

  const updatedPlayers = oldBucket.data.players.filter((p) => p.uid !== uid);

  const oldBucketUpdates: {
    players: LeaguePlayerEntry[];
    updatedAt: FirebaseFirestore.FieldValue;
    status?: "active";
  } = {
    players: updatedPlayers,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // If bucket was full and now has space, reactivate it
  if (oldBucket.data.status === "full" && updatedPlayers.length < 30) {
    oldBucketUpdates.status = "active";
  }

  tx.update(oldBucketRef, oldBucketUpdates);
}

