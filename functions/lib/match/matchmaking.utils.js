"use strict";
/**
 * Matchmaking Math Utilities
 *
 * Pure functions for skill-based matchmaking calculations.
 * 5D skill vector: [BILIM%, COGRAFYA%, SPOR%, MATEMATIK%, NormalizedTrophies]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateEuclideanDistance = calculateEuclideanDistance;
exports.normalizeTrophies = normalizeTrophies;
exports.calculateUserVector = calculateUserVector;
exports.getDynamicThreshold = getDynamicThreshold;
exports.generateBotSkillVector = generateBotSkillVector;
const constants_1 = require("../shared/constants");
// ============================================================================
// VECTOR CALCULATIONS
// ============================================================================
/**
 * 5D Euclidean distance: sqrt(sum((a[i] - b[i])^2))
 */
function calculateEuclideanDistance(vecA, vecB) {
    if (vecA.length !== vecB.length) {
        throw new Error(`Vector length mismatch: ${vecA.length} vs ${vecB.length}`);
    }
    let sumSquares = 0;
    for (let i = 0; i < vecA.length; i++) {
        const diff = vecA[i] - vecB[i];
        sumSquares += diff * diff;
    }
    return Math.sqrt(sumSquares);
}
/**
 * Trophy'leri 0-100 scale'e normalize et.
 * 2000 trophies = 100 points.
 */
function normalizeTrophies(trophies) {
    const safeValue = Math.max(0, Number(trophies) || 0);
    return Math.min(safeValue / constants_1.TROPHY_NORMALIZATION_FACTOR, 100);
}
/**
 * Category stats'tan yüzde hesapla.
 * Yeni kullanıcılar için default 50% (orta seviye).
 */
function calcCategoryPercentage(stat) {
    if (!stat || stat.total === 0) {
        return 50; // New user default
    }
    return Math.round((stat.correct / stat.total) * 100);
}
/**
 * UserDoc'tan 5D skill vector hesapla.
 * [BILIM%, COGRAFYA%, SPOR%, MATEMATIK%, NormalizedTrophies]
 */
function calculateUserVector(params) {
    const { categoryStats, trophies } = params;
    // ALL_SYMBOLS sırasına göre yüzdeleri hesapla
    const percentages = constants_1.ALL_SYMBOLS.map((symbol) => calcCategoryPercentage(categoryStats?.[symbol]));
    return [...percentages, normalizeTrophies(trophies)];
}
/**
 * Bekleme süresine göre dinamik threshold hesapla.
 * - Başlangıç: 15 (strict matching)
 * - Her 5 saniyede +10
 * - Max: 120
 */
function getDynamicThreshold(waitTimeSeconds) {
    const increments = Math.floor(waitTimeSeconds / constants_1.MATCH_THRESHOLD_INCREMENT_INTERVAL);
    const threshold = constants_1.MATCH_THRESHOLD_INITIAL + (increments * constants_1.MATCH_THRESHOLD_INCREMENT);
    return Math.min(threshold, constants_1.MATCH_THRESHOLD_MAX);
}
/**
 * Random bot skill vector oluştur (belirli profile'a göre).
 */
function generateBotSkillVector(profile) {
    const profiles = {
        WEAK: { min: 20, max: 40 },
        AVERAGE: { min: 40, max: 60 },
        STRONG: { min: 60, max: 80 },
        PRO: { min: 80, max: 95 },
    };
    const { min, max } = profiles[profile];
    const randomBetween = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    return [
        randomBetween(min, max), // BILIM
        randomBetween(min, max), // COGRAFYA
        randomBetween(min, max), // SPOR
        randomBetween(min, max), // MATEMATIK
        randomBetween(min, max), // NormalizedTrophies
    ];
}
