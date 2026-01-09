/**
 * Stress Test Configuration
 * 
 * Bot davranışı ve test parametreleri burada tanımlanır.
 */

import path from "node:path";
import dotenv from "dotenv";

// Load env vars first (ESM imports are hoisted, so we need to load here)
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

export const BOT_CONFIG = {
  // Test botlarının doğru cevaplama oranı (%85)
  CORRECT_ANSWER_RATE: 0.85,
  
  // Maç sonrası tekrar maç arama ihtimali (%30)
  REMATCH_CHANCE: 0.30,
  
  // Simüle edilmiş "düşünme" süresi (ms)
  THINK_DELAY_MS: 400,
  
  // Spin sonrası bekleme
  SPIN_DELAY_MS: 300,
  
  // Result görüntüleme süresi
  RESULT_DELAY_MS: 200,
  
  // İlk hamle öncesi maksimum random bekleme (maçları asenkron yapar)
  INITIAL_DELAY_MAX_MS: 2000,
};

/**
 * Passive Bot Difficulty → Correct Answer Rate Mapping
 * 
 * Passive botların difficulty değerine (1-10) göre doğru cevaplama oranı.
 * - WEAK (1-3): %40-50 doğru
 * - AVERAGE (4-6): %55-65 doğru
 * - STRONG (7-8): %70-75 doğru
 * - PRO (9-10): %80-85 doğru
 */
export const PASSIVE_BOT_CORRECT_RATES: Record<number, number> = {
  1: 0.40,   // WEAK - çok zayıf
  2: 0.45,
  3: 0.50,
  4: 0.55,   // AVERAGE
  5: 0.60,
  6: 0.65,
  7: 0.70,   // STRONG
  8: 0.75,
  9: 0.80,   // PRO
  10: 0.85,
};

export const TEST_CONFIG = {
  // Emulator ports
  AUTH_EMULATOR_HOST: "localhost:9099",
  FIRESTORE_EMULATOR_HOST: "localhost:8080",
  FUNCTIONS_EMULATOR_HOST: "localhost:5001",
  
  // Timeout'lar
  MATCH_TIMEOUT_MS: 180_000, // 3 dakika max per match
  FUNCTION_TIMEOUT_MS: 15_000, // 15s per function call
  
  // Queue timeout (client-side, matches backend QUEUE_TIMEOUT_SECONDS)
  QUEUE_TIMEOUT_SECONDS: 30,
};

// Firebase config (emulator için minimal config yeterli)
export const FIREBASE_CONFIG = {
  apiKey: "fake-api-key-for-emulator",
  authDomain: "localhost",
  // Trim whitespace from env var (some .env files have spaces after =)
  projectId: (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "yks-arena").trim(),
};

export type ChoiceKey = "A" | "B" | "C" | "D" | "E";
export type SymbolKey = "BILIM" | "COGRAFYA" | "SPOR" | "MATEMATIK";

export type MatchStatus = "WAITING" | "ACTIVE" | "FINISHED" | "CANCELLED";
export type TurnPhase = "SPIN" | "QUESTION" | "RESULT" | "END";

export interface MatchMetrics {
  matchId: string;
  startTime: number;
  endTime: number;
  duration: number;
  totalTurns: number;
  winner: string | null;
  errors: string[];
  botAUid: string;
  botBUid: string;
}

