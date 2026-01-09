/**
 * Matchmaking Math Utilities
 * 5D skill vector: [BILIM%, COGRAFYA%, SPOR%, MATEMATIK%, NormalizedTrophies]
 */

import {
    TROPHY_NORMALIZATION_FACTOR,
    MATCH_THRESHOLD_INITIAL,
    MATCH_THRESHOLD_INCREMENT,
    MATCH_THRESHOLD_INCREMENT_INTERVAL,
    MATCH_THRESHOLD_MAX,
    ALL_SYMBOLS,
  } from "../shared/constants";
  import type { UserCategoryStats, SymbolKey } from "../shared/types";
  
  // ============================================================================
  // BUCKET CONFIGURATION
  // ============================================================================
  
  export const SKILL_BUCKETS = {
    TENEKE: { min: 0, max: 400 },
    BRONZ: { min: 401, max: 1000 },
    GUMUS: { min: 1001, max: 1800 },
    ALTIN: { min: 1801, max: 2800 },
    ELMAS: { min: 2801, max: Infinity }
  } as const;
  
  export type BucketName = keyof typeof SKILL_BUCKETS;
  
  /**
   * Kullanıcının kupa sayısına göre bucket ismini döner.
   */
  export function getUserBucket(trophies: number): BucketName {
    if (trophies <= 400) return "TENEKE";
    if (trophies <= 1000) return "BRONZ";
    if (trophies <= 1800) return "GUMUS";
    if (trophies <= 2800) return "ALTIN";
    return "ELMAS";
  }
  
  // ============================================================================
  // VECTOR CALCULATIONS
  // ============================================================================
  
  export function calculateEuclideanDistance(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 999;
    let sumSquares = 0;
    for (let i = 0; i < vecA.length; i++) {
      const diff = vecA[i] - vecB[i];
      sumSquares += diff * diff;
    }
    return Math.sqrt(sumSquares);
  }
  
  export function normalizeTrophies(trophies: number): number {
    const safeValue = Math.max(0, Number(trophies) || 0);
    return Math.min(safeValue / TROPHY_NORMALIZATION_FACTOR, 100);
  }
  
  function calcCategoryPercentage(stat: { correct: number; total: number } | undefined): number {
    if (!stat || stat.total === 0) return 50;
    return Math.round((stat.correct / stat.total) * 100);
  }
  
  export function calculateUserVector(params: {
    categoryStats?: UserCategoryStats | null;
    trophies: number;
  }): number[] {
    const { categoryStats, trophies } = params;
    const percentages = ALL_SYMBOLS.map((symbol: SymbolKey) => 
      calcCategoryPercentage(categoryStats?.[symbol])
    );
    return [...percentages, normalizeTrophies(trophies)];
  }
  
  export function getDynamicThreshold(waitTimeSeconds: number): number {
    const increments = Math.floor(waitTimeSeconds / MATCH_THRESHOLD_INCREMENT_INTERVAL);
    return Math.min(
      MATCH_THRESHOLD_INITIAL + (increments * MATCH_THRESHOLD_INCREMENT),
      MATCH_THRESHOLD_MAX
    );
  }
  
  export function generateBotSkillVector(profile: "WEAK" | "AVERAGE" | "STRONG" | "PRO"): number[] {
    const profiles = {
      WEAK: { min: 20, max: 40 },
      AVERAGE: { min: 40, max: 60 },
      STRONG: { min: 60, max: 80 },
      PRO: { min: 80, max: 95 },
    };
    const { min, max } = profiles[profile];
    const randomBetween = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
    return [randomBetween(min, max), randomBetween(min, max), randomBetween(min, max), randomBetween(min, max), randomBetween(min, max)];
  }