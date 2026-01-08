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
  // %90 doğru, %10 yanlış cevap
  CORRECT_ANSWER_RATE: 0.90,
  
  // Simüle edilmiş "düşünme" süresi (ms)
  THINK_DELAY_MS: 200,
  
  // Spin sonrası bekleme
  SPIN_DELAY_MS: 100,
  
  // Result görüntüleme süresi
  RESULT_DELAY_MS: 100,
};

export const TEST_CONFIG = {
  // Emulator ports
  AUTH_EMULATOR_HOST: "localhost:9099",
  FIRESTORE_EMULATOR_HOST: "localhost:8080",
  FUNCTIONS_EMULATOR_HOST: "localhost:5001",
  
  // Timeout'lar
  MATCH_TIMEOUT_MS: 120_000, // 2 dakika max per match (paralel testlerde emulator yavaşlar)
  FUNCTION_TIMEOUT_MS: 10_000, // 10s per function call
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

