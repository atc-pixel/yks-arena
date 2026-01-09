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
exports.computeRatingBucketAndSignature = computeRatingBucketAndSignature;
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
// ============================================================================
// RATING + SIGNATURE (simplified matchmaking)
// ============================================================================
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function safeInt(n) {
    const v = Number(n);
    return Number.isFinite(v) ? Math.trunc(v) : 0;
}
function smoothedAccuracy(params) {
    const correct = Math.max(0, params.correct);
    const total = Math.max(0, params.total);
    return (correct + constants_1.MATCH_RATING_SHRINK_ALPHA) / (total + constants_1.MATCH_RATING_SHRINK_ALPHA + constants_1.MATCH_RATING_SHRINK_BETA);
}
/**
 * Kullanıcıdan "overall rating + dominant signature" üretir.
 * Neden: 5D distance yerine, benzer profilleri ucuz query ile eşleştirmek.
 */
function computeRatingBucketAndSignature(params) {
    const trophies = Math.max(0, safeInt(params.trophies));
    const categoryStats = params.categoryStats ?? null;
    const perSymbol = constants_1.ALL_SYMBOLS.map((symbol) => {
        const stat = categoryStats?.[symbol];
        const correct = safeInt(stat?.correct ?? 0);
        const total = safeInt(stat?.total ?? 0);
        return { symbol, correct, total, acc: smoothedAccuracy({ correct, total }) };
    });
    const totalAnswered = perSymbol.reduce((sum, s) => sum + s.total, 0);
    const confidence = clamp(totalAnswered / constants_1.MATCH_RATING_CONFIDENCE_TOTAL, 0, 1);
    const avgAcc = perSymbol.reduce((sum, s) => sum + s.acc, 0) / perSymbol.length;
    const accAdjust = Math.round((avgAcc - 0.5) * constants_1.MATCH_RATING_ACC_SCALE * confidence);
    const rating = trophies + accAdjust;
    const bucket = Math.floor(rating / constants_1.MATCH_BUCKET_SIZE);
    let signature = "NEW";
    if (totalAnswered >= constants_1.MATCH_SIGNATURE_NEW_MIN_TOTAL) {
        const sorted = [...perSymbol].sort((a, b) => {
            if (b.acc !== a.acc)
                return b.acc - a.acc;
            // deterministic tie-breaker: ALL_SYMBOLS order
            return constants_1.ALL_SYMBOLS.indexOf(a.symbol) - constants_1.ALL_SYMBOLS.indexOf(b.symbol);
        });
        const top1 = sorted[0]?.symbol ?? constants_1.ALL_SYMBOLS[0];
        const top2 = sorted[1]?.symbol ?? constants_1.ALL_SYMBOLS[1];
        signature = `${top1}_${top2}`;
    }
    return { rating, bucket, signature, totalAnswered };
}
