// functions/src/shared/constants.ts

export const CHOICE_KEYS = ["A", "B", "C", "D", "E"] as const;
export type ChoiceKey = (typeof CHOICE_KEYS)[number];

export const ALL_SYMBOLS = ["BILIM", "COGRAFYA", "SPOR", "MATEMATIK"] as const;
export type SymbolKey = (typeof ALL_SYMBOLS)[number];


export const DEFAULT_LIVES = 5;

// You can expand these later when you add multi-subject wheels:
export const DEFAULT_CATEGORY = "BILIM";
export type CategoryKey = typeof DEFAULT_CATEGORY;

// ============================================================================
// MATCHMAKING CONFIG
// ============================================================================

/** Kullanıcı bu süre içinde eşleşmezse bot_pool dahil edilir */
export const BOT_INCLUSION_THRESHOLD_SECONDS = 15;

/** Queue'da minimum tutulacak passive bot sayısı */
export const MIN_BOT_POOL_SIZE = 50;

/**
 * Matchmaking bucket size (rating quantization).
 * Neden: query maliyetini düşürür ve "yakın rating" aramasını basitleştirir.
 */
export const MATCH_BUCKET_SIZE = 100;

/**
 * Dominant signature için minimum toplam örnek.
 * Neden: az data ile "dominant" seçmek noise üretir; NEW olarak grupla.
 */
export const MATCH_SIGNATURE_NEW_MIN_TOTAL = 10;

/**
 * Shrinkage prior (Beta distribution).
 * Neden: yeni kullanıcı accuracy'si 0/1'e sapmasın; 0.5'e yakınsın.
 */
export const MATCH_RATING_SHRINK_ALPHA = 5;
export const MATCH_RATING_SHRINK_BETA = 5;

/** Confidence normalization: kaç soru sonra accuracy düzeltmesi tam etkili olsun */
export const MATCH_RATING_CONFIDENCE_TOTAL = 40;

/**
 * Accuracy adjustment scale.
 * avgAcc 0.5 iken 0 etkiler; 0.0..1.0 aralığında sınırlı oynama sağlar.
 */
export const MATCH_RATING_ACC_SCALE = 200;

/** Komşu bucket aramasına ne zaman genişleyelim (sn) */
export const MATCH_ADJACENT_BUCKET_WAIT_SECONDS = 5;

/** Dynamic threshold: başlangıç değeri */
export const MATCH_THRESHOLD_INITIAL = 15;

/** Dynamic threshold: her X saniyede artış */
export const MATCH_THRESHOLD_INCREMENT_INTERVAL = 5;

/** Dynamic threshold: artış miktarı */
export const MATCH_THRESHOLD_INCREMENT = 10;

/** Dynamic threshold: maksimum değer */
export const MATCH_THRESHOLD_MAX = 120;

/** Trophy normalization: 2000 trophies = 100 points */
export const TROPHY_NORMALIZATION_FACTOR = 20;
