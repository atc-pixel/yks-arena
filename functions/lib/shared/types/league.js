"use strict";
/**
 * League Bucket System Types & Zod Schemas
 *
 * Bu dosya leaderboard bucket sistemi için tüm type ve Zod schema tanımlarını içerir.
 *
 * Architecture Decision:
 * - Zod schemas runtime validation için (Firestore'dan gelen data)
 * - TypeScript types compile-time type safety için
 * - Dynamic Reward Keys: Ödül içeriği sistem config'den gelir, sadece key'leri saklıyoruz
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLAIMABLE_REWARDS_COLLECTION = exports.LEAGUE_META_DOC_ID = exports.SYSTEM_COLLECTION = exports.LEAGUES_COLLECTION = exports.ClaimableRewardSchema = exports.LeagueMetaSchema = exports.LeagueBucketSchema = exports.LeaguePlayerEntrySchema = exports.LeagueRewardKeySchema = exports.LeagueBucketStatusSchema = exports.LeagueTierSchema = void 0;
exports.getRankRewardKey = getRankRewardKey;
exports.getPromotionRewardKey = getPromotionRewardKey;
exports.getParticipationRewardKey = getParticipationRewardKey;
exports.generateBucketId = generateBucketId;
exports.parseBucketId = parseBucketId;
const zod_1 = require("zod");
// ============================================================================
// LEAGUE TIER
// ============================================================================
/**
 * League Tier Enum
 * - Teneke: Infinite pool (default for 0 trophies)
 * - Bronze, Silver, Gold, Platinum, Diamond: Bucket-based (max 30 players)
 */
exports.LeagueTierSchema = zod_1.z.enum([
    "Teneke",
    "Bronze",
    "Silver",
    "Gold",
    "Platinum",
    "Diamond",
]);
// ============================================================================
// LEAGUE BUCKET STATUS
// ============================================================================
/**
 * Bucket Status
 * - active: Aktif bucket, oyuncu alabilir
 * - full: Dolu (30/30), yeni oyuncu alamaz
 * - archived: Eski sezon bucket'ı, artık kullanılmıyor
 */
exports.LeagueBucketStatusSchema = zod_1.z.enum(["active", "full", "archived"]);
// ============================================================================
// DYNAMIC REWARD KEYS
// ============================================================================
/**
 * Dynamic Reward Key System
 *
 * Ödül içeriği (Gold amount, Energy, vb.) sistem config'den gelir.
 * Burada sadece reward key'lerini saklıyoruz, böylece ödül içeriğini
 * user data'yı migrate etmeden değiştirebiliriz.
 *
 * Reward Key Format: {TIER}_{TYPE}_{RANK/ACTION}
 *
 * Examples:
 * - BRONZE_RANK_1: Bronze bucket'ta 1. sırada olmak
 * - BRONZE_RANK_2: Bronze bucket'ta 2. sırada olmak
 * - BRONZE_PROMOTION: Bronze'dan Silver'a terfi
 * - BRONZE_PARTICIPATION: Bronze bucket'ta hafta boyunca oynamak
 * - SILVER_RANK_1: Silver bucket'ta 1. sırada olmak
 * - GOLD_DEMOTION: Gold'dan Silver'a düşmek (ceza yok, sadece tracking)
 */
exports.LeagueRewardKeySchema = zod_1.z.enum([
    // Bronze Rewards
    "BRONZE_RANK_1",
    "BRONZE_RANK_2",
    "BRONZE_RANK_3",
    "BRONZE_RANK_4",
    "BRONZE_RANK_5",
    "BRONZE_PROMOTION",
    "BRONZE_PARTICIPATION",
    // Silver Rewards
    "SILVER_RANK_1",
    "SILVER_RANK_2",
    "SILVER_RANK_3",
    "SILVER_RANK_4",
    "SILVER_RANK_5",
    "SILVER_PROMOTION",
    "SILVER_PARTICIPATION",
    // Gold Rewards
    "GOLD_RANK_1",
    "GOLD_RANK_2",
    "GOLD_RANK_3",
    "GOLD_RANK_4",
    "GOLD_RANK_5",
    "GOLD_PROMOTION",
    "GOLD_PARTICIPATION",
    // Platinum Rewards
    "PLATINUM_RANK_1",
    "PLATINUM_RANK_2",
    "PLATINUM_RANK_3",
    "PLATINUM_RANK_4",
    "PLATINUM_RANK_5",
    "PLATINUM_PROMOTION",
    "PLATINUM_PARTICIPATION",
    // Diamond Rewards
    "DIAMOND_RANK_1",
    "DIAMOND_RANK_2",
    "DIAMOND_RANK_3",
    "DIAMOND_RANK_4",
    "DIAMOND_RANK_5",
    "DIAMOND_PARTICIPATION", // Diamond'da promotion yok (en üst tier)
]);
// ============================================================================
// LEAGUE PLAYER ENTRY
// ============================================================================
/**
 * Bucket içindeki oyuncu kaydı
 *
 * Architecture Decision:
 * - weeklyTrophies: Bu hafta kazanılan toplam trophies (reset'te sıfırlanır)
 * - totalTrophies: Oyuncunun genel trophy sayısı (users/{uid}.trophies ile sync)
 * - rank: Bucket içindeki sıralama (weeklyTrophies'e göre hesaplanır, persist edilmez)
 */
exports.LeaguePlayerEntrySchema = zod_1.z.object({
    uid: zod_1.z.string(),
    weeklyTrophies: zod_1.z.number().min(0),
    totalTrophies: zod_1.z.number().min(0),
    joinedAt: zod_1.z.custom((val) => {
        return (val !== null &&
            typeof val === "object" &&
            "toMillis" in val &&
            typeof val.toMillis === "function");
    }),
});
// ============================================================================
// LEAGUE BUCKET
// ============================================================================
/**
 * League Bucket Document
 *
 * Collection: leagues
 * Document ID Format: {tier}_{seasonId}_{bucketNumber}
 * Example: bronze_S1_145
 *
 * Architecture Decision:
 * - players array: Max 30 real players (hard limit)
 * - Dummy users frontend'de handle edilir, DB'ye yazılmaz
 * - status: Bucket'ın durumu (active/full/archived)
 */
exports.LeagueBucketSchema = zod_1.z.object({
    tier: exports.LeagueTierSchema,
    seasonId: zod_1.z.string(), // e.g., "S1", "S2"
    bucketNumber: zod_1.z.number().int().positive(),
    status: exports.LeagueBucketStatusSchema,
    players: zod_1.z.array(exports.LeaguePlayerEntrySchema).max(30), // Hard limit: 30 real players
    createdAt: zod_1.z.custom((val) => {
        return (val !== null &&
            typeof val === "object" &&
            "toMillis" in val &&
            typeof val.toMillis === "function");
    }),
    updatedAt: zod_1.z.custom((val) => {
        return (val !== null &&
            typeof val === "object" &&
            "toMillis" in val &&
            typeof val.toMillis === "function");
    }),
});
// ============================================================================
// LEAGUE META
// ============================================================================
/**
 * League System Metadata
 *
 * Collection: system
 * Document ID: league_meta
 *
 * Architecture Decision:
 * - openBuckets: Her tier için açık (kapasitesi < 30) bucket'ların listesi
 * - Bu bilgi bucket assignment'ı hızlandırmak için cache'lenir
 * - Transaction'da güncellenir (consistency için)
 */
exports.LeagueMetaSchema = zod_1.z.object({
    openBuckets: zod_1.z.record(exports.LeagueTierSchema, zod_1.z.array(zod_1.z.string()) // Array of bucket IDs (e.g., ["bronze_S1_145", "bronze_S1_146"])
    ),
    currentSeasonId: zod_1.z.string(),
    lastResetAt: zod_1.z.custom((val) => {
        return (val !== null &&
            typeof val === "object" &&
            "toMillis" in val &&
            typeof val.toMillis === "function");
    }).nullable(),
    updatedAt: zod_1.z.custom((val) => {
        return (val !== null &&
            typeof val === "object" &&
            "toMillis" in val &&
            typeof val.toMillis === "function");
    }),
});
// ============================================================================
// CLAIMABLE REWARD
// ============================================================================
/**
 * Claimable Reward Document
 *
 * Collection: users/{uid}/claimable_rewards
 * Document ID: Auto-generated (e.g., reward_1234567890)
 *
 * Architecture Decision:
 * - rewardKey: Dynamic reward key (LeagueRewardKey)
 * - status: 'pending' -> 'claimed' -> 'expired' (optional, future use)
 * - seasonId: Hangi sezon için verildi
 * - createdAt: Reward'ın oluşturulma zamanı
 * - claimedAt: (optional) Reward'ın claim edilme zamanı
 *
 * Ödül içeriği (Gold amount, Energy, vb.) sistem config'den gelir.
 * Bu document sadece "hangi reward'ı claim edebilir" bilgisini tutar.
 */
exports.ClaimableRewardSchema = zod_1.z.object({
    rewardKey: exports.LeagueRewardKeySchema,
    seasonId: zod_1.z.string(),
    status: zod_1.z.enum(["pending", "claimed", "expired"]).default("pending"),
    createdAt: zod_1.z.custom((val) => {
        return (val !== null &&
            typeof val === "object" &&
            "toMillis" in val &&
            typeof val.toMillis === "function");
    }),
    claimedAt: zod_1.z
        .custom((val) => {
        return (val !== null &&
            typeof val === "object" &&
            "toMillis" in val &&
            typeof val.toMillis === "function");
    })
        .nullable()
        .optional(),
});
// ============================================================================
// COLLECTION CONSTANTS
// ============================================================================
exports.LEAGUES_COLLECTION = "leagues";
exports.SYSTEM_COLLECTION = "system";
exports.LEAGUE_META_DOC_ID = "league_meta";
exports.CLAIMABLE_REWARDS_COLLECTION = "claimable_rewards";
// ============================================================================
// HELPER FUNCTIONS: REWARD KEY GENERATION
// ============================================================================
/**
 * Rank-based reward key generator
 *
 * @param tier - League tier
 * @param rank - Rank in bucket (1-5 for top 5)
 * @returns LeagueRewardKey for rank reward
 */
function getRankRewardKey(tier, rank) {
    const tierUpper = tier.toUpperCase();
    return `${tierUpper}_RANK_${rank}`;
}
/**
 * Promotion reward key generator
 *
 * @param fromTier - Current tier (before promotion)
 * @returns LeagueRewardKey for promotion reward
 */
function getPromotionRewardKey(fromTier) {
    // Teneke'den Bronze'a promotion reward yok (default entry)
    if (fromTier === "Teneke")
        return null;
    const tierUpper = fromTier.toUpperCase();
    return `${tierUpper}_PROMOTION`;
}
/**
 * Participation reward key generator
 *
 * @param tier - League tier
 * @returns LeagueRewardKey for participation reward
 */
function getParticipationRewardKey(tier) {
    // Teneke için participation reward yok
    if (tier === "Teneke") {
        throw new Error("Teneke tier does not have participation rewards");
    }
    const tierUpper = tier.toUpperCase();
    return `${tierUpper}_PARTICIPATION`;
}
/**
 * Bucket ID generator
 *
 * @param tier - League tier
 * @param seasonId - Season ID (e.g., "S1")
 * @param bucketNumber - Bucket number
 * @returns Bucket document ID
 */
function generateBucketId(tier, seasonId, bucketNumber) {
    const tierLower = tier.toLowerCase();
    return `${tierLower}_${seasonId}_${bucketNumber}`;
}
/**
 * Parse bucket ID to components
 *
 * @param bucketId - Bucket document ID (e.g., "bronze_S1_145")
 * @returns Parsed components or null if invalid
 */
function parseBucketId(bucketId) {
    const parts = bucketId.split("_");
    if (parts.length !== 3)
        return null;
    const [tierStr, seasonId, bucketNumberStr] = parts;
    const tier = tierStr.charAt(0).toUpperCase() + tierStr.slice(1).toLowerCase();
    // Validate tier
    if (!exports.LeagueTierSchema.safeParse(tier).success)
        return null;
    const bucketNumber = parseInt(bucketNumberStr, 10);
    if (isNaN(bucketNumber) || bucketNumber <= 0)
        return null;
    return { tier, seasonId, bucketNumber };
}
