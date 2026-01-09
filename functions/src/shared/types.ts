/**
 * Shared Types for Backend Functions
 * 
 * Backend'de kullanılan type'lar burada tanımlanır.
 * Frontend'deki schemas.ts ile uyumlu olmalı.
 */

import { Timestamp } from "firebase-admin/firestore";

// ============================================================================
// MATCH TYPES
// ============================================================================

export type MatchStatus = "WAITING" | "ACTIVE" | "FINISHED" | "CANCELLED";
export type MatchMode = "RANDOM" | "INVITE";
export type TurnPhase = "SPIN" | "QUESTION" | "RESULT" | "END";
export type SymbolKey = "BILIM" | "COGRAFYA" | "SPOR" | "MATEMATIK";
export type ChoiceKey = "A" | "B" | "C" | "D" | "E";

export type PlayerState = {
  trophies: number;
  symbols: SymbolKey[];
  wrongCount: number;
  answeredCount: number;
};

export type TurnLastResult = {
  uid: string;
  questionId: string;
  symbol: SymbolKey;
  answer: ChoiceKey;
  correctAnswer: ChoiceKey;
  isCorrect: boolean;
  kupaAwarded?: number;
  earnedSymbol: SymbolKey | null;
  at: number;
  questionIndex?: 0 | 1 | 2;
};

export type MatchTurn = {
  currentUid: string;
  phase: TurnPhase;
  challengeSymbol: SymbolKey | null;
  streak: number;
  activeQuestionId: string | null;
  nextQuestionId?: string | null; // Q1 doğru olduğunda Q2'yi burada sakla (RESULT phase'inde)
  usedQuestionIds: string[];
  lastResult?: TurnLastResult | null;
  streakSymbol?: SymbolKey | null;
  questionIndex?: 0 | 1 | 2;
};

export type MatchDoc = {
  createdAt: Timestamp;
  status: MatchStatus;
  mode: MatchMode;
  players: string[]; // [uid1, uid2]
  turn: MatchTurn;
  stateByUid: Record<string, PlayerState>;
  winnerUid?: string;
  endedReason?: string;
  // Bot tracking for auto-play logic
  playerTypes?: Record<string, "HUMAN" | "BOT">;
};

// ============================================================================
// INVITE TYPES
// ============================================================================

export type InviteStatus = "OPEN" | "CLOSED" | "CANCELLED";

export type InviteDoc = {
  createdAt: Timestamp;
  createdBy: string;
  matchId: string;
  status: InviteStatus;
};

// ============================================================================
// QUESTION TYPES
// ============================================================================

// Category = SymbolKey (aynı değerler, question document'lerinde category field'ı SymbolKey olarak kullanılıyor)
export type Category = "BILIM" | "COGRAFYA" | "SPOR" | "MATEMATIK";

export type QuestionDoc = {
  category: Category;
  question: string;
  choices: Record<ChoiceKey, string>;
  answer: ChoiceKey;
  isActive?: boolean;
  randomId?: number;
  randomHash?: string;
  topic?: string | null;
  questionNumber?: string | null;
  explanation?: string | null;
  difficulty?: number | null;
};

// ============================================================================
// USER CATEGORY STATS (for matchmaking skill vector)
// ============================================================================

/**
 * Category bazlı doğru/yanlış sayıları.
 * onMatchFinished'da güncellenir, matchmaking skill vector'ü için kullanılır.
 */
export type CategoryStat = {
  correct: number;
  total: number;
};

export type UserCategoryStats = Record<SymbolKey, CategoryStat>;

// ============================================================================
// QUEUE TYPES (for matchmaking)
// ============================================================================

export type QueueTicketStatus = "WAITING" | "MATCHED" | "EXPIRED";

export type QueueTicket = {
  uid: string;
  createdAt: Timestamp;
  status: QueueTicketStatus;
  /**
   * Matchmaking rating (trophies + shrinkage'lı category accuracy düzeltmesi).
   * Neden: tek skor + bucket ile hızlı ve ucuz candidate search.
   */
  rating: number;
  /** rating'in bucket karşılığı (MATCH_BUCKET_SIZE ile quantize) */
  bucket: number;
  /**
   * Dominant signature: benzer profil eşleşmesi için.
   * - NEW (yetersiz örnek)
   * - "TOP1_TOP2" (örn "BILIM_MATEMATIK")
   */
  signature: string;

  /** Eşleşme bulunduğunda iki tarafa da yazılır (idempotent teslim) */
  matchId?: string;

  /** Contention azaltmak için atomic claim alanları */
  claimedAt?: Timestamp;
  claimedBy?: string;

  // Bot identification
  isBot: boolean;
  botDifficulty?: number; // 1-10 (only for passive bots)
};

