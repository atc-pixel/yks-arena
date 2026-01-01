/**
 * Zod Validation Schemas
 * 
 * Bu dosya tüm Firestore document ve API input validation'larını içerir.
 * Runtime'da gelen data'nın type-safe olduğundan emin olmak için kullanılır.
 * 
 * Architecture Decision: 
 * - Types'ları types.ts'de tutuyoruz (compile-time)
 * - Schemas'ları burada tutuyoruz (runtime validation)
 * - Parse helper'ları validation/utils.ts'de olacak
 */

import { z } from "zod";
import type { Timestamp } from "firebase/firestore";

// ============================================================================
// FIREBASE TIMESTAMP HANDLING
// ============================================================================
// Firestore Timestamp'leri runtime'da object olarak gelir, 
// Zod'da direkt Timestamp type'ı yok, o yüzden custom transform yapıyoruz

const FirestoreTimestampSchema = z.union([
  // Timestamp object (runtime)
  z.object({
    seconds: z.number(),
    nanoseconds: z.number(),
  }),
  // Timestamp class instance (bazı durumlarda)
  z.custom<Timestamp>((val): val is Timestamp => {
    return (
      val !== null &&
      typeof val === "object" &&
      "toMillis" in val &&
      typeof (val as { toMillis: () => number }).toMillis === "function"
    );
  }, {
    message: "Invalid Timestamp",
  }),
  // ServerTimestamp placeholder (backend'den geliyorsa)
  z.null(),
]).transform((val) => {
  // Transform to Timestamp if needed, otherwise return as-is
  // Client-side'da Timestamp olarak kullanacağız
  return val as Timestamp;
});

// ============================================================================
// ENUMS & LITERALS
// ============================================================================

// Category = SymbolKey (aynı değerler, question document'lerinde category field'ı SymbolKey olarak kullanılıyor)
export const CategorySchema = z.enum(["BILIM", "COGRAFYA", "SPOR", "MATEMATIK"]);
export const ChoiceKeySchema = z.enum(["A", "B", "C", "D", "E"]);
export const MatchStatusSchema = z.enum(["WAITING", "ACTIVE", "FINISHED", "CANCELLED"]);
export const SymbolKeySchema = z.enum(["BILIM", "COGRAFYA", "SPOR", "MATEMATIK"]);
export const TurnPhaseSchema = z.enum(["SPIN", "QUESTION", "RESULT", "END"]);
export const MatchModeSchema = z.enum(["RANDOM", "INVITE"]);
export const LeagueNameSchema = z.enum(["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"]);

// ============================================================================
// QUESTION SCHEMA
// ============================================================================

export const QuestionSchema = z.object({
  id: z.string(),
  category: CategorySchema,
  topic: z.string().nullable().optional(),
  questionNumber: z.string().nullable().optional(),
  question: z.string(),
  choices: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
    E: z.string(),
  }),
  answer: ChoiceKeySchema,
  explanation: z.string().nullable().optional(),
  difficulty: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

// Firestore'dan gelen Question document (id field yok, document ID kullanılır)
export const QuestionDocSchema = QuestionSchema.omit({ id: true });

// ============================================================================
// MATCH SCHEMAS
// ============================================================================

export const TurnLastResultSchema = z.object({
  uid: z.string(),
  questionId: z.string(),
  symbol: SymbolKeySchema,
  answer: ChoiceKeySchema,
  correctAnswer: ChoiceKeySchema,
  isCorrect: z.boolean(),
  kupaAwarded: z.number().optional(),
  earnedSymbol: SymbolKeySchema.nullable(),
  at: z.number(),
  questionIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
});

export const PlayerStateSchema = z.object({
  trophies: z.number(),
  symbols: z.array(SymbolKeySchema),
  wrongCount: z.number(),
  answeredCount: z.number(),
});

export const MatchTurnSchema = z.object({
  currentUid: z.string(),
  phase: TurnPhaseSchema,
  challengeSymbol: SymbolKeySchema.nullable(),
  streak: z.number(),
  activeQuestionId: z.string().nullable(),
  nextQuestionId: z.string().nullable().optional(), // Q1 doğru olduğunda Q2'yi burada sakla (RESULT phase'inde)
  usedQuestionIds: z.array(z.string()),
  lastResult: TurnLastResultSchema.nullable().optional(),
  streakSymbol: SymbolKeySchema.nullable().optional(),
  questionIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
});

export const MatchDocSchema = z.object({
  createdAt: FirestoreTimestampSchema,
  status: MatchStatusSchema,
  mode: MatchModeSchema,
  players: z.array(z.string()).length(2), // Exactly 2 players
  turn: MatchTurnSchema,
  stateByUid: z.record(z.string(), PlayerStateSchema),
  winnerUid: z.string().optional(),
  endedReason: z.string().optional(),
});

// ============================================================================
// USER SCHEMAS
// ============================================================================

export const UserLeagueSchema = z.object({
  currentLeague: LeagueNameSchema,
  weeklyScore: z.number(),
});

export const UserStatsSchema = z.object({
  totalMatches: z.number(),
  totalWins: z.number(),
});

export const UserEconomySchema = z.object({
  energy: z.number(),
  maxEnergy: z.number(),
  lastEnergyRefill: FirestoreTimestampSchema,
});

export const UserPresenceSchema = z.object({
  activeMatchCount: z.number(),
}).optional();

export const UserDocSchema = z.object({
  displayName: z.string(),
  photoURL: z.string().nullable(),
  trophies: z.number(),
  level: z.number(),
  league: UserLeagueSchema,
  stats: UserStatsSchema,
  economy: UserEconomySchema,
  presence: UserPresenceSchema,
  createdAt: FirestoreTimestampSchema,
});

// ============================================================================
// API INPUT SCHEMAS
// ============================================================================

export const CreateInviteInputSchema = z.object({});
export const JoinInviteInputSchema = z.object({
  code: z.string().min(4).max(10),
});
export const SpinInputSchema = z.object({
  matchId: z.string().min(1),
});
export const SubmitAnswerInputSchema = z.object({
  matchId: z.string().min(1),
  answer: ChoiceKeySchema,
});
export const ContinueToNextQuestionInputSchema = z.object({
  matchId: z.string().min(1),
});
export const CancelInviteInputSchema = z.object({
  inviteId: z.string().min(1),
});

// ============================================================================
// TYPE EXPORTS (Zod'dan infer edilen types + utility types)
// ============================================================================

export type QuestionDoc = z.infer<typeof QuestionDocSchema>;
export type MatchDoc = z.infer<typeof MatchDocSchema>;
export type UserDoc = z.infer<typeof UserDocSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;
export type TurnLastResult = z.infer<typeof TurnLastResultSchema>;

// Utility types (backward compatibility için)
export type Category = z.infer<typeof CategorySchema>;
export type ChoiceKey = z.infer<typeof ChoiceKeySchema>;
export type MatchStatus = z.infer<typeof MatchStatusSchema>;
export type SymbolKey = z.infer<typeof SymbolKeySchema>;
export type TurnPhase = z.infer<typeof TurnPhaseSchema>;
export type MatchMode = z.infer<typeof MatchModeSchema>;
export type LeagueName = z.infer<typeof LeagueNameSchema>;

