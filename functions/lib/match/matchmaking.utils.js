"use strict";
/**
 * Matchmaking Math Utilities
 * 5D skill vector: [BILIM%, COGRAFYA%, SPOR%, MATEMATIK%, NormalizedTrophies]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKILL_BUCKETS = void 0;
exports.getUserBucket = getUserBucket;
exports.calculateEuclideanDistance = calculateEuclideanDistance;
exports.normalizeTrophies = normalizeTrophies;
exports.calculateUserVector = calculateUserVector;
exports.getDynamicThreshold = getDynamicThreshold;
exports.generateBotSkillVector = generateBotSkillVector;
const constants_1 = require("../shared/constants");
// ============================================================================
// BUCKET CONFIGURATION
// ============================================================================
exports.SKILL_BUCKETS = {
    TENEKE: { min: 0, max: 400 },
    BRONZ: { min: 401, max: 1000 },
    GUMUS: { min: 1001, max: 1800 },
    ALTIN: { min: 1801, max: 2800 },
    ELMAS: { min: 2801, max: Infinity }
};
/**
 * Kullanıcının kupa sayısına göre bucket ismini döner.
 */
function getUserBucket(trophies) {
    if (trophies <= 400)
        return "TENEKE";
    if (trophies <= 1000)
        return "BRONZ";
    if (trophies <= 1800)
        return "GUMUS";
    if (trophies <= 2800)
        return "ALTIN";
    return "ELMAS";
}
// ============================================================================
// VECTOR CALCULATIONS
// ============================================================================
function calculateEuclideanDistance(vecA, vecB) {
    if (vecA.length !== vecB.length)
        return 999;
    let sumSquares = 0;
    for (let i = 0; i < vecA.length; i++) {
        const diff = vecA[i] - vecB[i];
        sumSquares += diff * diff;
    }
    return Math.sqrt(sumSquares);
}
function normalizeTrophies(trophies) {
    const safeValue = Math.max(0, Number(trophies) || 0);
    return Math.min(safeValue / constants_1.TROPHY_NORMALIZATION_FACTOR, 100);
}
function calcCategoryPercentage(stat) {
    if (!stat || stat.total === 0)
        return 50;
    return Math.round((stat.correct / stat.total) * 100);
}
function calculateUserVector(params) {
    const { categoryStats, trophies } = params;
    const percentages = constants_1.ALL_SYMBOLS.map((symbol) => calcCategoryPercentage(categoryStats?.[symbol]));
    return [...percentages, normalizeTrophies(trophies)];
}
function getDynamicThreshold(waitTimeSeconds) {
    const increments = Math.floor(waitTimeSeconds / constants_1.MATCH_THRESHOLD_INCREMENT_INTERVAL);
    return Math.min(constants_1.MATCH_THRESHOLD_INITIAL + (increments * constants_1.MATCH_THRESHOLD_INCREMENT), constants_1.MATCH_THRESHOLD_MAX);
}
function generateBotSkillVector(profile) {
    const profiles = {
        WEAK: { min: 20, max: 40 },
        AVERAGE: { min: 40, max: 60 },
        STRONG: { min: 60, max: 80 },
        PRO: { min: 80, max: 95 },
    };
    const { min, max } = profiles[profile];
    const randomBetween = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    return [randomBetween(min, max), randomBetween(min, max), randomBetween(min, max), randomBetween(min, max), randomBetween(min, max)];
}
