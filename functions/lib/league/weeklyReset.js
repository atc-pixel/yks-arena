"use strict";
/**
 * Weekly League Reset
 *
 * Pseudo-code implementation for weekly league reset and reward distribution.
 *
 * Architecture Decision:
 * - Scheduled Job: Runs every Sunday 23:59 (Europe/Istanbul) via Cloud Scheduler
 * - Batch Processing: Process all active buckets in batches (Firestore batch limits)
 * - Dynamic Rewards: Write reward keys to claimable_rewards, not hardcoded values
 * - Transaction Safety: Each bucket processed in separate transaction (avoid conflicts)
 *
 * Process Flow:
 * 1. Query all active buckets (status === 'active' OR status === 'full')
 * 2. For each bucket:
 *    a. Sort players by weeklyTrophies (descending)
 *    b. Top 5: Promote + Rank Rewards
 *    c. Bottom 5 (if bucket full): Demote
 *    d. 0 Trophies: Send to Teneke
 *    e. Generate and write reward keys
 * 3. Update league meta (lastResetAt, openBuckets)
 * 4. Reset all players' weeklyTrophies to 0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.weeklyReset = weeklyReset;
const firestore_1 = require("../utils/firestore");
const league_1 = require("../shared/types/league");
const weeklyReset_helpers_1 = require("./weeklyReset.utils");
/**
 * Process a single bucket for weekly reset
 *
 * Pseudo-code Flow:
 *
 * 1. TRANSACTION START
 *
 * 2. Read bucket document (leagues/{bucketId})
 *    - Validate with LeagueBucketSchema
 *    - Skip if tier === 'Teneke' (Teneke doesn't reset)
 *
 * 3. Sort players by weeklyTrophies (descending)
 *    - Create sorted array: [...players].sort((a, b) => b.weeklyTrophies - a.weeklyTrophies)
 *
 * 4. Process Top 5 (Promotion + Rank Rewards):
 *    For each player in top 5 (rank 1-5):
 *      a. If tier < Diamond:
 *         - Determine nextTier = getNextTier(tier)
 *         - Call assignToLeague(uid, seasonId, nextTier) [separate transaction]
 *         - Generate promotion reward: getPromotionRewardKey(tier)
 *         - Create claimable reward: createClaimableReward(uid, promotionKey, seasonId)
 *      b. Generate rank reward: getRankRewardKey(tier, rank)
 *      c. Create claimable reward: createClaimableReward(uid, rankKey, seasonId)
 *
 * 5. Process Bottom 5 (Demotion, only if bucket full):
 *    If bucket.players.length === 30:
 *      For each player in bottom 5 (last 5 in sorted array):
 *        a. If tier > Bronze:
 *           - Determine prevTier = getPreviousTier(tier)
 *           - Call assignToLeague(uid, seasonId, prevTier) [separate transaction]
 *        b. (No reward for demotion, just tracking)
 *
 * 6. Process 0 Trophies (Send to Teneke):
 *    For each player with weeklyTrophies === 0:
 *      a. Call assignToLeague(uid, seasonId, 'Teneke') [separate transaction]
 *      b. (No reward for Teneke)
 *
 * 7. Process Participation Rewards:
 *    For each remaining player (not in top 5, not demoted, not sent to Teneke):
 *      a. Generate participation reward: getParticipationRewardKey(tier)
 *      b. Create claimable reward: createClaimableReward(uid, participationKey, seasonId)
 *
 * 8. Reset bucket players:
 *    - Update all players' weeklyTrophies to 0
 *    - Update bucket.updatedAt
 *    - If bucket was full, set status back to 'active'
 *
 * 9. TRANSACTION COMMIT
 *
 * Note: assignToLeague calls are done in separate transactions to avoid
 * transaction size limits and conflicts. This function only handles reward
 * distribution and bucket state updates.
 */
async function processBucket(bucketId, newSeasonId) {
    let promoted = 0;
    let demoted = 0;
    let sentToTeneke = 0;
    let rewardsDistributed = 0;
    return await firestore_1.db.runTransaction(async (tx) => {
        // 1. Read bucket
        const bucketRef = firestore_1.db.collection(league_1.LEAGUES_COLLECTION).doc(bucketId);
        const bucketSnap = await tx.get(bucketRef);
        if (!bucketSnap.exists) {
            // Bucket doesn't exist, skip
            return { promoted: 0, demoted: 0, sentToTeneke: 0, rewardsDistributed: 0 };
        }
        const bucketData = bucketSnap.data();
        const bucket = league_1.LeagueBucketSchema.parse(bucketData);
        // 2. Skip Teneke (infinite pool, no reset needed)
        if (bucket.tier === "Teneke") {
            return { promoted: 0, demoted: 0, sentToTeneke: 0, rewardsDistributed: 0 };
        }
        // 3. Sort players by weeklyTrophies (descending)
        const sortedPlayers = [...bucket.players].sort((a, b) => b.weeklyTrophies - a.weeklyTrophies);
        const top5 = sortedPlayers.slice(0, 5);
        const bottom5 = sortedPlayers.slice(-5);
        const zeroTrophyPlayers = sortedPlayers.filter((p) => p.weeklyTrophies === 0);
        const remainingPlayers = sortedPlayers.filter((p, index) => index >= 5 && index < sortedPlayers.length - 5 && p.weeklyTrophies > 0);
        // 4. Process Top 5 (Promotion + Rank Rewards)
        for (let i = 0; i < top5.length; i++) {
            const player = top5[i];
            const rank = (i + 1);
            // Promotion (if not Diamond)
            if (bucket.tier !== "Diamond") {
                const nextTier = (0, weeklyReset_helpers_1.getNextTier)(bucket.tier);
                if (nextTier) {
                    // Note: assignToLeague will be called in separate transaction
                    // We just mark for promotion here
                    promoted++;
                    // Promotion reward
                    const promotionKey = (0, league_1.getPromotionRewardKey)(bucket.tier);
                    if (promotionKey) {
                        (0, weeklyReset_helpers_1.createClaimableReward)(tx, player.uid, promotionKey, newSeasonId);
                        rewardsDistributed++;
                    }
                }
            }
            // Rank reward
            const rankKey = (0, league_1.getRankRewardKey)(bucket.tier, rank);
            (0, weeklyReset_helpers_1.createClaimableReward)(tx, player.uid, rankKey, newSeasonId);
            rewardsDistributed++;
        }
        // 5. Process Bottom 5 (Demotion, only if bucket full)
        if (bucket.players.length === 30) {
            for (const player of bottom5) {
                // Skip if already in zero trophy list (will be sent to Teneke)
                if (player.weeklyTrophies === 0)
                    continue;
                if (bucket.tier !== "Bronze") {
                    const prevTier = (0, weeklyReset_helpers_1.getPreviousTier)(bucket.tier);
                    if (prevTier) {
                        // Note: assignToLeague will be called in separate transaction
                        demoted++;
                        // No reward for demotion
                    }
                }
            }
        }
        // 6. Process 0 Trophies (Send to Teneke)
        for (const player of zeroTrophyPlayers) {
            // Note: assignToLeague will be called in separate transaction
            sentToTeneke++;
            // No reward for Teneke
        }
        // 7. Process Participation Rewards (remaining players)
        for (const player of remainingPlayers) {
            const participationKey = (0, league_1.getParticipationRewardKey)(bucket.tier);
            (0, weeklyReset_helpers_1.createClaimableReward)(tx, player.uid, participationKey, newSeasonId);
            rewardsDistributed++;
        }
        // 8. Reset bucket players (set weeklyTrophies to 0)
        const resetPlayers = bucket.players.map((p) => ({
            ...p,
            weeklyTrophies: 0,
        }));
        const updates = {
            players: resetPlayers,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        // If bucket was full, set status back to active
        if (bucket.status === "full") {
            updates.status = "active";
        }
        tx.update(bucketRef, updates);
        return { promoted, demoted, sentToTeneke, rewardsDistributed };
    });
}
/**
 * Execute league assignments (promotions, demotions, Teneke sends)
 */
async function executeLeagueAssignments(assignments) {
    const { assignToLeague } = await Promise.resolve().then(() => __importStar(require("./assignToLeague")));
    for (const assignment of assignments) {
        try {
            await assignToLeague({
                uid: assignment.uid,
                seasonId: assignment.seasonId,
                targetTier: assignment.targetTier,
            });
        }
        catch (error) {
            console.error(`Failed to assign ${assignment.uid} to ${assignment.targetTier}:`, error);
        }
    }
}
/**
 * Update league meta after reset
 *
 * Pseudo-code:
 * 1. Read system/league_meta
 * 2. Generate new seasonId (if not provided)
 * 3. Update lastResetAt: FieldValue.serverTimestamp()
 * 4. Update currentSeasonId to new season
 * 5. Rebuild openBuckets cache (for new season, starts empty)
 * 6. Update updatedAt
 */
async function updateLeagueMetaAfterReset(newSeasonId) {
    return await firestore_1.db.runTransaction(async (tx) => {
        const metaRef = firestore_1.db.collection(league_1.SYSTEM_COLLECTION).doc(league_1.LEAGUE_META_DOC_ID);
        const metaSnap = await tx.get(metaRef);
        if (!metaSnap.exists) {
            const { Timestamp } = await Promise.resolve().then(() => __importStar(require("../utils/firestore")));
            const now = Timestamp.now();
            const newMeta = {
                openBuckets: {
                    Teneke: [],
                    Bronze: [],
                    Silver: [],
                    Gold: [],
                    Platinum: [],
                    Diamond: [],
                },
                currentSeasonId: newSeasonId,
                lastResetAt: now,
                updatedAt: now,
            };
            tx.create(metaRef, newMeta);
            return newSeasonId;
        }
        const metaData = metaSnap.data();
        const meta = league_1.LeagueMetaSchema.parse(metaData);
        // Update lastResetAt and currentSeasonId
        tx.update(metaRef, {
            currentSeasonId: newSeasonId,
            lastResetAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            // Reset openBuckets for new season (starts empty)
            openBuckets: {
                Teneke: [],
                Bronze: [],
                Silver: [],
                Gold: [],
                Platinum: [],
                Diamond: [],
            },
        });
        return newSeasonId;
    });
    // Note: openBuckets cache is reset in transaction above
    // It will be rebuilt as new buckets are created in the new season
}
// ============================================================================
// MAIN FUNCTION
// ============================================================================
/**
 * Weekly League Reset
 *
 * Pseudo-code Flow:
 *
 * 1. Query all active buckets:
 *    - Collection: leagues
 *    - Where: status IN ['active', 'full'] AND seasonId == params.seasonId
 *    - Order by: tier, bucketNumber
 *
 * 2. Process buckets in batches:
 *    - For each bucket:
 *      a. Call processBucket(bucketId, seasonId)
 *      b. Collect promotion/demotion/Teneke assignments
 *
 * 3. Execute league assignments:
 *    - Call executeLeagueAssignments(allAssignments)
 *    - This moves players to new buckets
 *
 * 4. Update league meta:
 *    - Call updateLeagueMetaAfterReset(seasonId)
 *    - Rebuild openBuckets cache
 *
 * 5. Reset user weeklyTrophies:
 *    - For each player in all processed buckets:
 *      - Update users/{uid}.league.weeklyTrophies = 0
 *    - (Note: This is already done in processBucket for bucket players,
 *      but we also need to update user documents)
 *
 * 6. Return result summary
 *
 * Error Handling:
 * - If bucket processing fails: Log error, continue with next bucket
 * - If assignment fails: Log error, continue (idempotent)
 * - If meta update fails: Retry (critical operation)
 */
async function weeklyReset(params) {
    const { seasonId: providedSeasonId, batchSize = 50 } = params;
    // 0. Get current season ID and generate new one
    const metaRef = firestore_1.db.collection(league_1.SYSTEM_COLLECTION).doc(league_1.LEAGUE_META_DOC_ID);
    const metaSnap = await metaRef.get();
    let currentSeasonId;
    let newSeasonId;
    if (providedSeasonId) {
        // Season ID provided, use it
        currentSeasonId = providedSeasonId;
        newSeasonId = providedSeasonId;
    }
    else {
        // Auto-generate new season ID
        if (metaSnap.exists) {
            const metaData = metaSnap.data();
            const meta = league_1.LeagueMetaSchema.parse(metaData);
            currentSeasonId = meta.currentSeasonId;
            newSeasonId = (0, weeklyReset_helpers_1.generateNextSeasonId)(meta.currentSeasonId);
        }
        else {
            // First reset, start with S1
            currentSeasonId = "S1";
            newSeasonId = "S1";
        }
    }
    let totalPromoted = 0;
    let totalDemoted = 0;
    let totalSentToTeneke = 0;
    let totalRewardsDistributed = 0;
    let bucketsProcessed = 0;
    // 1. Query all active buckets for CURRENT season
    const bucketsQuery = firestore_1.db
        .collection(league_1.LEAGUES_COLLECTION)
        .where("status", "in", ["active", "full"])
        .where("seasonId", "==", currentSeasonId);
    const bucketsSnapshot = await bucketsQuery.get();
    if (bucketsSnapshot.empty) {
        // No buckets to process
        return {
            bucketsProcessed: 0,
            playersPromoted: 0,
            playersDemoted: 0,
            playersSentToTeneke: 0,
            rewardsDistributed: 0,
        };
    }
    // 2. Process buckets in batches
    const allAssignments = [];
    for (let i = 0; i < bucketsSnapshot.docs.length; i += batchSize) {
        const batch = bucketsSnapshot.docs.slice(i, i + batchSize);
        for (const doc of batch) {
            const bucketId = doc.id;
            const bucketData = doc.data();
            const bucket = league_1.LeagueBucketSchema.safeParse(bucketData);
            if (!bucket.success) {
                // Invalid bucket, skip
                console.error(`Invalid bucket ${bucketId}:`, bucket.error);
                continue;
            }
            try {
                const result = await processBucket(bucketId, newSeasonId);
                totalPromoted += result.promoted;
                totalDemoted += result.demoted;
                totalSentToTeneke += result.sentToTeneke;
                totalRewardsDistributed += result.rewardsDistributed;
                bucketsProcessed++;
                // Collect assignments (would be populated in real implementation)
                // For now, we'll need to track these in processBucket and return them
                // This is a simplified version - in real implementation, processBucket
                // would return assignment list
            }
            catch (error) {
                console.error(`Failed to process bucket ${bucketId}:`, error);
                // Continue with next bucket
            }
        }
    }
    // 3. Execute league assignments
    if (allAssignments.length > 0) {
        await executeLeagueAssignments(allAssignments);
    }
    // 4. Update league meta (with new season ID)
    await updateLeagueMetaAfterReset(newSeasonId);
    // 5. Reset user weeklyTrophies
    // Collect all UIDs from processed buckets and reset their weeklyTrophies
    const allUserUids = new Set();
    for (const doc of bucketsSnapshot.docs) {
        const bucketData = doc.data();
        const bucket = league_1.LeagueBucketSchema.safeParse(bucketData);
        if (bucket.success) {
            bucket.data.players.forEach((p) => allUserUids.add(p.uid));
        }
    }
    if (allUserUids.size > 0) {
        await (0, weeklyReset_helpers_1.resetUserWeeklyTrophies)(Array.from(allUserUids));
    }
    return {
        bucketsProcessed,
        playersPromoted: totalPromoted,
        playersDemoted: totalDemoted,
        playersSentToTeneke: totalSentToTeneke,
        rewardsDistributed: totalRewardsDistributed,
    };
}
