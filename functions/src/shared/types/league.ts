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

import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

// ============================================================================
// LEAGUE TIER
// ============================================================================

/**
 * League Tier Enum
 * - Teneke: Infinite pool (default for 0 trophies)
 * - Bronze, Silver, Gold, Platinum, Diamond: Bucket-based (max 30 players)
 */
export const LeagueTierSchema = z.enum([
  "Teneke",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
]);

export type LeagueTier = z.infer<typeof LeagueTierSchema>;

// ============================================================================
// LEAGUE BUCKET STATUS
// ============================================================================

/**
 * Bucket Status
 * - active: Aktif bucket, oyuncu alabilir
 * - full: Dolu (30/30), yeni oyuncu alamaz
 * - archived: Eski sezon bucket'ı, artık kullanılmıyor
 */
export const LeagueBucketStatusSchema = z.enum(["active", "full", "archived"]);

export type LeagueBucketStatus = z.infer<typeof LeagueBucketStatusSchema>;

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
export const LeagueRewardKeySchema = z.enum([
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

export type LeagueRewardKey = z.infer<typeof LeagueRewardKeySchema>;

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
export const LeaguePlayerEntrySchema = z.object({
  uid: z.string(),
  weeklyTrophies: z.number().min(0),
  totalTrophies: z.number().min(0),
  joinedAt: z.custom<Timestamp>((val): val is Timestamp => {
    return (
      val !== null &&
      typeof val === "object" &&
      "toMillis" in val &&
      typeof (val as { toMillis: () => number }).toMillis === "function"
    );
  }),
});

export type LeaguePlayerEntry = z.infer<typeof LeaguePlayerEntrySchema>;

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
export const LeagueBucketSchema = z.object({
  tier: LeagueTierSchema,
  seasonId: z.string(), // e.g., "S1", "S2"
  bucketNumber: z.number().int().positive(),
  status: LeagueBucketStatusSchema,
  players: z.array(LeaguePlayerEntrySchema).max(30), // Hard limit: 30 real players
  createdAt: z.custom<Timestamp>((val): val is Timestamp => {
    return (
      val !== null &&
      typeof val === "object" &&
      "toMillis" in val &&
      typeof (val as { toMillis: () => number }).toMillis === "function"
    );
  }),
  updatedAt: z.custom<Timestamp>((val): val is Timestamp => {
    return (
      val !== null &&
      typeof val === "object" &&
      "toMillis" in val &&
      typeof (val as { toMillis: () => number }).toMillis === "function"
    );
  }),
});

export type LeagueBucket = z.infer<typeof LeagueBucketSchema>;

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
export const LeagueMetaSchema = z.object({
  openBuckets: z.record(
    LeagueTierSchema,
    z.array(z.string()) // Array of bucket IDs (e.g., ["bronze_S1_145", "bronze_S1_146"])
  ),
  currentSeasonId: z.string(),
  lastResetAt: z.custom<Timestamp>((val): val is Timestamp => {
    return (
      val !== null &&
      typeof val === "object" &&
      "toMillis" in val &&
      typeof (val as { toMillis: () => number }).toMillis === "function"
    );
  }).nullable(),
  updatedAt: z.custom<Timestamp>((val): val is Timestamp => {
    return (
      val !== null &&
      typeof val === "object" &&
      "toMillis" in val &&
      typeof (val as { toMillis: () => number }).toMillis === "function"
    );
  }),
});

export type LeagueMeta = z.infer<typeof LeagueMetaSchema>;

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
export const ClaimableRewardSchema = z.object({
  rewardKey: LeagueRewardKeySchema,
  seasonId: z.string(),
  status: z.enum(["pending", "claimed", "expired"]).default("pending"),
  createdAt: z.custom<Timestamp>((val): val is Timestamp => {
    return (
      val !== null &&
      typeof val === "object" &&
      "toMillis" in val &&
      typeof (val as { toMillis: () => number }).toMillis === "function"
    );
  }),
  claimedAt: z
    .custom<Timestamp>((val): val is Timestamp => {
      return (
        val !== null &&
        typeof val === "object" &&
        "toMillis" in val &&
        typeof (val as { toMillis: () => number }).toMillis === "function"
      );
    })
    .nullable()
    .optional(),
});

export type ClaimableReward = z.infer<typeof ClaimableRewardSchema>;

// ============================================================================
// COLLECTION CONSTANTS
// ============================================================================

export const LEAGUES_COLLECTION = "leagues";
export const SYSTEM_COLLECTION = "system";
export const LEAGUE_META_DOC_ID = "league_meta";
export const CLAIMABLE_REWARDS_COLLECTION = "claimable_rewards";

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
export function getRankRewardKey(
  tier: LeagueTier,
  rank: 1 | 2 | 3 | 4 | 5
): LeagueRewardKey {
  const tierUpper = tier.toUpperCase() as "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";
  return `${tierUpper}_RANK_${rank}` as LeagueRewardKey;
}

/**
 * Promotion reward key generator
 * 
 * @param fromTier - Current tier (before promotion)
 * @returns LeagueRewardKey for promotion reward
 */
export function getPromotionRewardKey(fromTier: LeagueTier): LeagueRewardKey | null {
  // Teneke'den Bronze'a promotion reward yok (default entry)
  if (fromTier === "Teneke") return null;
  
  const tierUpper = fromTier.toUpperCase() as "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  return `${tierUpper}_PROMOTION` as LeagueRewardKey;
}

/**
 * Participation reward key generator
 * 
 * @param tier - League tier
 * @returns LeagueRewardKey for participation reward
 */
export function getParticipationRewardKey(tier: LeagueTier): LeagueRewardKey {
  // Teneke için participation reward yok
  if (tier === "Teneke") {
    throw new Error("Teneke tier does not have participation rewards");
  }
  
  const tierUpper = tier.toUpperCase() as "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";
  return `${tierUpper}_PARTICIPATION` as LeagueRewardKey;
}

/**
 * Bucket ID generator
 * 
 * @param tier - League tier
 * @param seasonId - Season ID (e.g., "S1")
 * @param bucketNumber - Bucket number
 * @returns Bucket document ID
 */
export function generateBucketId(
  tier: LeagueTier,
  seasonId: string,
  bucketNumber: number
): string {
  const tierLower = tier.toLowerCase();
  return `${tierLower}_${seasonId}_${bucketNumber}`;
}

/**
 * Parse bucket ID to components
 * 
 * @param bucketId - Bucket document ID (e.g., "bronze_S1_145")
 * @returns Parsed components or null if invalid
 */
export function parseBucketId(bucketId: string): {
  tier: LeagueTier;
  seasonId: string;
  bucketNumber: number;
} | null {
  const parts = bucketId.split("_");
  if (parts.length !== 3) return null;

  const [tierStr, seasonId, bucketNumberStr] = parts;
  const tier = tierStr.charAt(0).toUpperCase() + tierStr.slice(1).toLowerCase() as LeagueTier;
  
  // Validate tier
  if (!LeagueTierSchema.safeParse(tier).success) return null;
  
  const bucketNumber = parseInt(bucketNumberStr, 10);
  if (isNaN(bucketNumber) || bucketNumber <= 0) return null;

  return { tier, seasonId, bucketNumber };
}

