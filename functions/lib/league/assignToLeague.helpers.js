"use strict";
/**
 * Helper functions for assignToLeague
 *
 * Architecture Decision:
 * - Helper functions extracted to keep assignToLeague.ts clean and focused
 * - All helpers are transaction-aware (receive tx parameter)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOpenBucket = findOpenBucket;
exports.createNewBucket = createNewBucket;
exports.updateLeagueMeta = updateLeagueMeta;
exports.removeUserFromOldBucket = removeUserFromOldBucket;
const firestore_1 = require("../utils/firestore");
const league_1 = require("../shared/types/league");
/**
 * Find an open bucket for the given tier
 */
async function findOpenBucket(tx, tier, seasonId) {
    const metaRef = firestore_1.db.collection(league_1.SYSTEM_COLLECTION).doc(league_1.LEAGUE_META_DOC_ID);
    const metaSnap = await tx.get(metaRef);
    if (!metaSnap.exists) {
        return null;
    }
    const metaData = metaSnap.data();
    const meta = league_1.LeagueMetaSchema.parse(metaData);
    const openBucketIds = meta.openBuckets[tier] || [];
    for (const bucketId of openBucketIds) {
        const bucketRef = firestore_1.db.collection(league_1.LEAGUES_COLLECTION).doc(bucketId);
        const bucketSnap = await tx.get(bucketRef);
        if (!bucketSnap.exists) {
            continue;
        }
        const bucketData = bucketSnap.data();
        const bucket = league_1.LeagueBucketSchema.parse(bucketData);
        if (bucket.seasonId === seasonId &&
            bucket.status === "active" &&
            bucket.players.length < 30) {
            return bucketId;
        }
    }
    return null;
}
/**
 * Create a new bucket for the given tier
 */
async function createNewBucket(tx, tier, seasonId) {
    const metaRef = firestore_1.db.collection(league_1.SYSTEM_COLLECTION).doc(league_1.LEAGUE_META_DOC_ID);
    const metaSnap = await tx.get(metaRef);
    let bucketNumber = 1;
    if (metaSnap.exists) {
        const metaData = metaSnap.data();
        const meta = league_1.LeagueMetaSchema.parse(metaData);
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
    const bucketId = (0, league_1.generateBucketId)(tier, seasonId, bucketNumber);
    const bucketRef = firestore_1.db.collection(league_1.LEAGUES_COLLECTION).doc(bucketId);
    const now = firestore_1.Timestamp.now();
    const newBucket = {
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
async function updateLeagueMeta(tx, tier, bucketId, seasonId) {
    const metaRef = firestore_1.db.collection(league_1.SYSTEM_COLLECTION).doc(league_1.LEAGUE_META_DOC_ID);
    const metaSnap = await tx.get(metaRef);
    if (!metaSnap.exists) {
        const now = firestore_1.Timestamp.now();
        const newMeta = {
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
    const meta = league_1.LeagueMetaSchema.parse(metaData);
    const currentOpenBuckets = meta.openBuckets[tier] || [];
    if (!currentOpenBuckets.includes(bucketId)) {
        currentOpenBuckets.push(bucketId);
    }
    tx.update(metaRef, {
        [`openBuckets.${tier}`]: currentOpenBuckets,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
/**
 * Remove user from old bucket
 */
async function removeUserFromOldBucket(tx, uid, seasonId, newBucketId) {
    const allBucketsQuery = firestore_1.db
        .collection(league_1.LEAGUES_COLLECTION)
        .where("seasonId", "==", seasonId)
        .where("status", "in", ["active", "full"]);
    const allBucketsSnapshot = await allBucketsQuery.get();
    for (const oldBucketDoc of allBucketsSnapshot.docs) {
        if (oldBucketDoc.id === newBucketId)
            continue;
        const oldBucketData = oldBucketDoc.data();
        const oldBucket = league_1.LeagueBucketSchema.safeParse(oldBucketData);
        if (!oldBucket.success)
            continue;
        const playerIndex = oldBucket.data.players.findIndex((p) => p.uid === uid);
        if (playerIndex === -1)
            continue;
        const oldBucketRef = firestore_1.db.collection(league_1.LEAGUES_COLLECTION).doc(oldBucketDoc.id);
        const updatedPlayers = oldBucket.data.players.filter((p) => p.uid !== uid);
        const oldBucketUpdates = {
            players: updatedPlayers,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        if (oldBucket.data.status === "full" && updatedPlayers.length < 30) {
            oldBucketUpdates.status = "active";
        }
        tx.update(oldBucketRef, oldBucketUpdates);
        break;
    }
}
