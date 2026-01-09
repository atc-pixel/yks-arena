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

/** Kullanıcı bu süre içinde eşleşmezse otomatik bot ile eşleşir */
export const QUEUE_TIMEOUT_SECONDS = 30;

/** Queue'da minimum tutulacak passive bot sayısı */
export const MIN_BOT_POOL_SIZE = 50;

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
