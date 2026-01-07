"use strict";
/**
 * League Reward Configuration
 *
 * Bu dosya dinamik reward key'lerin gerçek içeriğini tanımlar.
 * Reward key'ler league.ts'de tanımlı, burada sadece içerikleri var.
 *
 * Architecture Decision:
 * - Esnek yapı: Her reward farklı tipte olabilir (gold, energy, item, vb.)
 * - Reward içeriği değiştiğinde sadece bu dosya güncellenir
 * - User data migration gerekmez (sadece key'ler saklanıyor)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REWARD_CONFIG = void 0;
exports.getRewardItems = getRewardItems;
/**
 * Reward Configuration
 *
 * Her LeagueRewardKey için reward içeriği
 * Henüz rewardlar belli değil, placeholder olarak boş array'ler
 */
exports.REWARD_CONFIG = {
    // Bronze Rewards
    BRONZE_RANK_1: [], // TODO: Define rewards
    BRONZE_RANK_2: [],
    BRONZE_RANK_3: [],
    BRONZE_RANK_4: [],
    BRONZE_RANK_5: [],
    BRONZE_PROMOTION: [],
    BRONZE_PARTICIPATION: [],
    // Silver Rewards
    SILVER_RANK_1: [],
    SILVER_RANK_2: [],
    SILVER_RANK_3: [],
    SILVER_RANK_4: [],
    SILVER_RANK_5: [],
    SILVER_PROMOTION: [],
    SILVER_PARTICIPATION: [],
    // Gold Rewards
    GOLD_RANK_1: [],
    GOLD_RANK_2: [],
    GOLD_RANK_3: [],
    GOLD_RANK_4: [],
    GOLD_RANK_5: [],
    GOLD_PROMOTION: [],
    GOLD_PARTICIPATION: [],
    // Platinum Rewards
    PLATINUM_RANK_1: [],
    PLATINUM_RANK_2: [],
    PLATINUM_RANK_3: [],
    PLATINUM_RANK_4: [],
    PLATINUM_RANK_5: [],
    PLATINUM_PROMOTION: [],
    PLATINUM_PARTICIPATION: [],
    // Diamond Rewards
    DIAMOND_RANK_1: [],
    DIAMOND_RANK_2: [],
    DIAMOND_RANK_3: [],
    DIAMOND_RANK_4: [],
    DIAMOND_RANK_5: [],
    DIAMOND_PARTICIPATION: [],
};
/**
 * Get reward items for a reward key
 *
 * @param rewardKey - League reward key
 * @returns Array of reward items
 */
function getRewardItems(rewardKey) {
    return exports.REWARD_CONFIG[rewardKey] || [];
}
