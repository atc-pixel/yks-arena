"use strict";
// functions/src/shared/constants.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.TROPHY_NORMALIZATION_FACTOR = exports.MATCH_THRESHOLD_MAX = exports.MATCH_THRESHOLD_INCREMENT = exports.MATCH_THRESHOLD_INCREMENT_INTERVAL = exports.MATCH_THRESHOLD_INITIAL = exports.MATCH_ADJACENT_BUCKET_WAIT_SECONDS = exports.MATCH_RATING_ACC_SCALE = exports.MATCH_RATING_CONFIDENCE_TOTAL = exports.MATCH_RATING_SHRINK_BETA = exports.MATCH_RATING_SHRINK_ALPHA = exports.MATCH_SIGNATURE_NEW_MIN_TOTAL = exports.MATCH_BUCKET_SIZE = exports.MIN_BOT_POOL_SIZE = exports.BOT_INCLUSION_THRESHOLD_SECONDS = exports.DEFAULT_CATEGORY = exports.DEFAULT_LIVES = exports.ALL_SYMBOLS = exports.CHOICE_KEYS = void 0;
exports.CHOICE_KEYS = ["A", "B", "C", "D", "E"];
exports.ALL_SYMBOLS = ["BILIM", "COGRAFYA", "SPOR", "MATEMATIK"];
exports.DEFAULT_LIVES = 5;
// You can expand these later when you add multi-subject wheels:
exports.DEFAULT_CATEGORY = "BILIM";
// ============================================================================
// MATCHMAKING CONFIG
// ============================================================================
/** Kullanıcı bu süre içinde eşleşmezse bot_pool dahil edilir */
exports.BOT_INCLUSION_THRESHOLD_SECONDS = 15;
/** Queue'da minimum tutulacak passive bot sayısı */
exports.MIN_BOT_POOL_SIZE = 50;
/**
 * Matchmaking bucket size (rating quantization).
 * Neden: query maliyetini düşürür ve "yakın rating" aramasını basitleştirir.
 */
exports.MATCH_BUCKET_SIZE = 100;
/**
 * Dominant signature için minimum toplam örnek.
 * Neden: az data ile "dominant" seçmek noise üretir; NEW olarak grupla.
 */
exports.MATCH_SIGNATURE_NEW_MIN_TOTAL = 10;
/**
 * Shrinkage prior (Beta distribution).
 * Neden: yeni kullanıcı accuracy'si 0/1'e sapmasın; 0.5'e yakınsın.
 */
exports.MATCH_RATING_SHRINK_ALPHA = 5;
exports.MATCH_RATING_SHRINK_BETA = 5;
/** Confidence normalization: kaç soru sonra accuracy düzeltmesi tam etkili olsun */
exports.MATCH_RATING_CONFIDENCE_TOTAL = 40;
/**
 * Accuracy adjustment scale.
 * avgAcc 0.5 iken 0 etkiler; 0.0..1.0 aralığında sınırlı oynama sağlar.
 */
exports.MATCH_RATING_ACC_SCALE = 200;
/** Komşu bucket aramasına ne zaman genişleyelim (sn) */
exports.MATCH_ADJACENT_BUCKET_WAIT_SECONDS = 5;
/** Dynamic threshold: başlangıç değeri */
exports.MATCH_THRESHOLD_INITIAL = 15;
/** Dynamic threshold: her X saniyede artış */
exports.MATCH_THRESHOLD_INCREMENT_INTERVAL = 5;
/** Dynamic threshold: artış miktarı */
exports.MATCH_THRESHOLD_INCREMENT = 10;
/** Dynamic threshold: maksimum değer */
exports.MATCH_THRESHOLD_MAX = 120;
/** Trophy normalization: 2000 trophies = 100 points */
exports.TROPHY_NORMALIZATION_FACTOR = 20;
