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
export type MatchMode = "SYNC_DUEL";
export type TurnPhase = "SPIN" | "QUESTION" | "RESULT" | "END"; // DEPRECATED - async duel için kullanılıyordu
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

// ============================================================================
// SYNC DUEL TYPES
// ============================================================================

export type SyncDuelQuestionAnswer = {
  choice: ChoiceKey | null; // null = henüz cevap vermedi
  isCorrect: boolean | null; // null = henüz hesaplanmadı
  clientElapsedMs: number | null; // Client-side timing (UX için)
  /**
   * Client'ın ölçtüğü yaklaşık latency (RTT/2 median).
   * Untrusted hint: sadece fairness için capped şekilde kullanılmalı.
   */
  clientLatencyMs?: number | null;
  serverReceiveAt: number | null; // Server timestamp (ms)
};

export type SyncDuelQuestion = {
  questionId: string; // Seçilen kategori soru
  serverStartAt: number; // Server timestamp (ms) - otorite
  answers: Record<string, SyncDuelQuestionAnswer>;
  endedReason: "CORRECT" | "TWO_WRONG" | "TIMEOUT" | null; // Soru nasıl bitti
  endedAt: number | null; // Soru bittiğinde
  /**
   * Soru CORRECT ile bittiğinde, puanı alan oyuncu.
   * Not: İki oyuncu da doğru yapabilir; ama puanı sadece en hızlı alır.
   */
  winnerUid?: string | null;
  /**
   * Grace window (lag compensation) için pending karar state'i.
   * - İlk doğru cevap geldiğinde set edilir.
   * - decisionAt gelince finalize edilir (ya 2. doğru ile submitAnswer içinde, ya finalize callable ile).
   */
  pendingWinnerUid?: string | null;
  decisionAt?: number | null; // server ms
};

export type SyncDuelMatchStatus = "WAITING_PLAYERS" | "QUESTION_ACTIVE" | "QUESTION_RESULT" | "MATCH_FINISHED";

export type SyncDuelMatchState = {
  questions: SyncDuelQuestion[]; // Soru geçmişi
  correctCounts: Record<string, number>; // { uid: correctCount } - Her oyuncunun doğru sayısı
  roundWins?: Record<string, number>; // { uid: roundWins } - onMatchFinished için (sync duel)
  currentQuestionIndex: number; // Kaçıncı soru (0-based)
  matchStatus: SyncDuelMatchStatus;
  disconnectedAt: Record<string, number | null>;
  reconnectDeadline: Record<string, number | null>;
  /**
   * Query-friendly minimum reconnect deadline (ms).
   * - null => no one is currently disconnected
   * - used by scheduled rage-quit finalizer
   */
  reconnectDeadlineMin?: number | null;
  rageQuitUids: string[];
  category: Category; // Match'in kategorisi (queue'dan gelir)
};

export type MatchDoc = {
  createdAt: Timestamp;
  status: MatchStatus;
  mode: MatchMode;
  players: string[]; // [uid1, uid2]
  syncDuel: SyncDuelMatchState;
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


export interface QueueTicket {
  uid: string;
  createdAt: Timestamp; // Firestore Timestamp (admin)
  status: "WAITING" | "MATCHED";
  /**
   * Idempotency: Eğer bu ticket MATCHED durumuna geçtiyse, ilgili matchId burada tutulur.
   * Böylece diğer cihaz/yeniden deneme aynı match'e yönlenir ve ikinci match yaratılmaz.
   */
  matchedMatchId?: string | null;
  skillVector: number[];
  category: Category; // Seçilen kategori
  isBot: boolean;
  botDifficulty?: number;
}