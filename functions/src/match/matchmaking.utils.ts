/**
 * Matchmaking Math Utilities
 * 
 * Pure functions for skill-based matchmaking calculations.
 * 5D skill vector: [BILIM%, COGRAFYA%, SPOR%, MATEMATIK%, NormalizedTrophies]
 */

import {
  TROPHY_NORMALIZATION_FACTOR,
  MATCH_THRESHOLD_INITIAL,
  MATCH_THRESHOLD_INCREMENT,
  MATCH_THRESHOLD_INCREMENT_INTERVAL,
  MATCH_THRESHOLD_MAX,
  MATCH_BUCKET_SIZE,
  MATCH_SIGNATURE_NEW_MIN_TOTAL,
  MATCH_RATING_SHRINK_ALPHA,
  MATCH_RATING_SHRINK_BETA,
  MATCH_RATING_CONFIDENCE_TOTAL,
  MATCH_RATING_ACC_SCALE,
  ALL_SYMBOLS,
} from "../shared/constants";
import type { UserCategoryStats, SymbolKey } from "../shared/types";

// ============================================================================
// VECTOR CALCULATIONS
// ============================================================================

/**
 * 5D Euclidean distance: sqrt(sum((a[i] - b[i])^2))
 */
export function calculateEuclideanDistance(vecA: number[], vecB: number[]): number {
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
export function normalizeTrophies(trophies: number): number {
  const safeValue = Math.max(0, Number(trophies) || 0);
  return Math.min(safeValue / TROPHY_NORMALIZATION_FACTOR, 100);
}

/**
 * Category stats'tan yüzde hesapla.
 * Yeni kullanıcılar için default 50% (orta seviye).
 */
function calcCategoryPercentage(stat: { correct: number; total: number } | undefined): number {
  if (!stat || stat.total === 0) {
    return 50; // New user default
  }
  return Math.round((stat.correct / stat.total) * 100);
}

/**
 * UserDoc'tan 5D skill vector hesapla.
 * [BILIM%, COGRAFYA%, SPOR%, MATEMATIK%, NormalizedTrophies]
 */
export function calculateUserVector(params: {
  categoryStats?: UserCategoryStats | null;
  trophies: number;
}): number[] {
  const { categoryStats, trophies } = params;
  
  // ALL_SYMBOLS sırasına göre yüzdeleri hesapla
  const percentages = ALL_SYMBOLS.map((symbol: SymbolKey) => 
    calcCategoryPercentage(categoryStats?.[symbol])
  );
  
  return [...percentages, normalizeTrophies(trophies)];
}

/**
 * Bekleme süresine göre dinamik threshold hesapla.
 * - Başlangıç: 15 (strict matching)
 * - Her 5 saniyede +10
 * - Max: 120
 */
export function getDynamicThreshold(waitTimeSeconds: number): number {
  const increments = Math.floor(waitTimeSeconds / MATCH_THRESHOLD_INCREMENT_INTERVAL);
  const threshold = MATCH_THRESHOLD_INITIAL + (increments * MATCH_THRESHOLD_INCREMENT);
  
  return Math.min(threshold, MATCH_THRESHOLD_MAX);
}

/**
 * Random bot skill vector oluştur (belirli profile'a göre).
 */
export function generateBotSkillVector(profile: "WEAK" | "AVERAGE" | "STRONG" | "PRO"): number[] {
  const profiles = {
    WEAK: { min: 20, max: 40 },
    AVERAGE: { min: 40, max: 60 },
    STRONG: { min: 60, max: 80 },
    PRO: { min: 80, max: 95 },
  };
  
  const { min, max } = profiles[profile];
  const randomBetween = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
  
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeInt(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : 0;
}

function smoothedAccuracy(params: { correct: number; total: number }): number {
  const correct = Math.max(0, params.correct);
  const total = Math.max(0, params.total);
  return (correct + MATCH_RATING_SHRINK_ALPHA) / (total + MATCH_RATING_SHRINK_ALPHA + MATCH_RATING_SHRINK_BETA);
}

export type RatingSignatureResult = {
  rating: number;
  bucket: number;
  signature: string; // "NEW" or `${top1}_${top2}`
  totalAnswered: number;
};

/**
 * Kullanıcıdan "overall rating + dominant signature" üretir.
 * Neden: 5D distance yerine, benzer profilleri ucuz query ile eşleştirmek.
 */
export function computeRatingBucketAndSignature(params: {
  trophies: number;
  categoryStats?: UserCategoryStats | null;
}): RatingSignatureResult {
  const trophies = Math.max(0, safeInt(params.trophies));
  const categoryStats = params.categoryStats ?? null;

  const perSymbol = ALL_SYMBOLS.map((symbol: SymbolKey) => {
    const stat = categoryStats?.[symbol];
    const correct = safeInt(stat?.correct ?? 0);
    const total = safeInt(stat?.total ?? 0);
    return { symbol, correct, total, acc: smoothedAccuracy({ correct, total }) };
  });

  const totalAnswered = perSymbol.reduce((sum, s) => sum + s.total, 0);
  const confidence = clamp(totalAnswered / MATCH_RATING_CONFIDENCE_TOTAL, 0, 1);
  const avgAcc = perSymbol.reduce((sum, s) => sum + s.acc, 0) / perSymbol.length;
  const accAdjust = Math.round((avgAcc - 0.5) * MATCH_RATING_ACC_SCALE * confidence);

  const rating = trophies + accAdjust;
  const bucket = Math.floor(rating / MATCH_BUCKET_SIZE);

  let signature = "NEW";
  if (totalAnswered >= MATCH_SIGNATURE_NEW_MIN_TOTAL) {
    const sorted = [...perSymbol].sort((a, b) => {
      if (b.acc !== a.acc) return b.acc - a.acc;
      // deterministic tie-breaker: ALL_SYMBOLS order
      return ALL_SYMBOLS.indexOf(a.symbol) - ALL_SYMBOLS.indexOf(b.symbol);
    });
    const top1 = sorted[0]?.symbol ?? ALL_SYMBOLS[0];
    const top2 = sorted[1]?.symbol ?? ALL_SYMBOLS[1];
    signature = `${top1}_${top2}`;
  }

  return { rating, bucket, signature, totalAnswered };
}

