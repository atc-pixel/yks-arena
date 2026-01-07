/**
 * Helper functions for weeklyReset
 * 
 * Architecture Decision:
 * - Helper functions extracted to keep weeklyReset.ts clean and focused
 */

import { db, FieldValue, Timestamp } from "../utils/firestore";
import {
  LeagueBucketSchema,
  LeagueMetaSchema,
  ClaimableRewardSchema,
  type LeagueTier,
  type LeagueRewardKey,
  type ClaimableReward,
  LEAGUES_COLLECTION,
  SYSTEM_COLLECTION,
  LEAGUE_META_DOC_ID,
  CLAIMABLE_REWARDS_COLLECTION,
  getRankRewardKey,
  getPromotionRewardKey,
  getParticipationRewardKey,
} from "../shared/types/league";
import { USER_COLLECTION } from "../users/types";

/**
 * Get next tier (promotion)
 */
export function getNextTier(currentTier: LeagueTier): LeagueTier | null {
  const tierOrder: LeagueTier[] = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
  const currentIndex = tierOrder.indexOf(currentTier);
  
  if (currentIndex === -1 || currentIndex === tierOrder.length - 1) {
    return null;
  }
  
  return tierOrder[currentIndex + 1];
}

/**
 * Get previous tier (demotion)
 */
export function getPreviousTier(currentTier: LeagueTier): LeagueTier | null {
  const tierOrder: LeagueTier[] = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
  const currentIndex = tierOrder.indexOf(currentTier);
  
  if (currentIndex <= 0) {
    return null;
  }
  
  return tierOrder[currentIndex - 1];
}

/**
 * Create claimable reward document
 */
export function createClaimableReward(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  rewardKey: LeagueRewardKey,
  seasonId: string
): void {
  const rewardId = `reward_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const rewardRef = db
    .collection(USER_COLLECTION)
    .doc(uid)
    .collection(CLAIMABLE_REWARDS_COLLECTION)
    .doc(rewardId);

  const reward: Omit<ClaimableReward, "createdAt"> & {
    createdAt: FirebaseFirestore.Timestamp;
  } = {
    rewardKey,
    seasonId,
    status: "pending",
    createdAt: Timestamp.now(),
    claimedAt: null,
  };

  ClaimableRewardSchema.parse(reward);

  tx.create(rewardRef, reward);
}

/**
 * Generate new season ID
 */
export function generateNextSeasonId(currentSeasonId: string): string {
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
export async function resetUserWeeklyTrophies(
  uids: string[]
): Promise<void> {
  const batchSize = 500;
  
  for (let i = 0; i < uids.length; i += batchSize) {
    const batch = uids.slice(i, i + batchSize);
    const updatePromises = batch.map((uid) =>
      db.collection(USER_COLLECTION).doc(uid).update({
        "league.weeklyTrophies": 0,
      })
    );
    
    await Promise.all(updatePromises);
  }
}

