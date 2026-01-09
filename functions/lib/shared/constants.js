"use strict";
// functions/src/shared/constants.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.TROPHY_NORMALIZATION_FACTOR = exports.MATCH_THRESHOLD_MAX = exports.MATCH_THRESHOLD_INCREMENT = exports.MATCH_THRESHOLD_INCREMENT_INTERVAL = exports.MATCH_THRESHOLD_INITIAL = exports.MIN_BOT_POOL_SIZE = exports.BOT_INCLUSION_THRESHOLD_SECONDS = exports.DEFAULT_CATEGORY = exports.DEFAULT_LIVES = exports.ALL_SYMBOLS = exports.CHOICE_KEYS = void 0;
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
