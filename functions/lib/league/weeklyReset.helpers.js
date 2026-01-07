"use strict";
/**
 * Helper functions for weeklyReset
 *
 * Architecture Decision:
 * - Helper functions extracted to keep weeklyReset.ts clean and focused
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextTier = getNextTier;
exports.getPreviousTier = getPreviousTier;
exports.createClaimableReward = createClaimableReward;
exports.generateNextSeasonId = generateNextSeasonId;
exports.resetUserWeeklyTrophies = resetUserWeeklyTrophies;
const firestore_1 = require("../utils/firestore");
const league_1 = require("../shared/types/league");
const types_1 = require("../users/types");
/**
 * Get next tier (promotion)
 */
function getNextTier(currentTier) {
    const tierOrder = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
    const currentIndex = tierOrder.indexOf(currentTier);
    if (currentIndex === -1 || currentIndex === tierOrder.length - 1) {
        return null;
    }
    return tierOrder[currentIndex + 1];
}
/**
 * Get previous tier (demotion)
 */
function getPreviousTier(currentTier) {
    const tierOrder = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
    const currentIndex = tierOrder.indexOf(currentTier);
    if (currentIndex <= 0) {
        return null;
    }
    return tierOrder[currentIndex - 1];
}
/**
 * Create claimable reward document
 */
function createClaimableReward(tx, uid, rewardKey, seasonId) {
    const rewardId = `reward_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const rewardRef = firestore_1.db
        .collection(types_1.USER_COLLECTION)
        .doc(uid)
        .collection(league_1.CLAIMABLE_REWARDS_COLLECTION)
        .doc(rewardId);
    const reward = {
        rewardKey,
        seasonId,
        status: "pending",
        createdAt: firestore_1.Timestamp.now(),
        claimedAt: null,
    };
    league_1.ClaimableRewardSchema.parse(reward);
    tx.create(rewardRef, reward);
}
/**
 * Generate new season ID
 */
function generateNextSeasonId(currentSeasonId) {
    const match = currentSeasonId.match(/^S(\d+)$/);
    if (!match) {
        return "S1";
    }
    const seasonNumber = parseInt(match[1], 10);
    return `S${seasonNumber + 1}`;
}
/**
 * Reset user weeklyTrophies to 0
 */
async function resetUserWeeklyTrophies(uids) {
    const batchSize = 500;
    for (let i = 0; i < uids.length; i += batchSize) {
        const batch = uids.slice(i, i + batchSize);
        const updatePromises = batch.map((uid) => firestore_1.db.collection(types_1.USER_COLLECTION).doc(uid).update({
            "league.weeklyTrophies": 0,
        }));
        await Promise.all(updatePromises);
    }
}
