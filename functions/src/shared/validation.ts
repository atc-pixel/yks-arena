/**
 * Zod Validation Schemas for Functions
 * 
 * API input validation için Zod schemas.
 * Client'taki schemas.ts ile uyumlu olmalı.
 * 
 * Architecture Decision:
 * - Functions'da sadece API input validation yapıyoruz
 * - Document validation yapmıyoruz (Firestore'dan gelen data zaten backend'de)
 * - strictParse kullanıyoruz (invalid input gelirse exception fırlatır)
 */

import { z } from "zod";

// ============================================================================
// ENUMS & LITERALS
// ============================================================================

export const ChoiceKeySchema = z.enum(["A", "B", "C", "D", "E"]);

// ============================================================================
// API INPUT SCHEMAS
// ============================================================================

// CreateInviteInputSchema - boş object bekliyor (null/undefined strictParse'da {}'ye çevrilir)
export const CreateInviteInputSchema = z.object({});

export const JoinInviteInputSchema = z.object({
  code: z.string().min(4).max(10),
});

export const CancelInviteInputSchema = z.object({
  inviteId: z.string().min(1),
});

// Matchmaking schemas
export const EnterQueueInputSchema = z.object({
  category: z.enum(["BILIM", "COGRAFYA", "SPOR", "MATEMATIK"]),
});

export const LeaveQueueInputSchema = z.object({});

// Sync Duel schemas
export const StartSyncDuelRoundInputSchema = z.object({
  matchId: z.string().min(1),
});

export const SubmitSyncDuelAnswerInputSchema = z.object({
  matchId: z.string().min(1),
  roundId: z.string().min(1),
  answer: ChoiceKeySchema,
  clientElapsedMs: z.number().min(0),
  // Approx RTT/2 (median) from client; untrusted hint, backend will cap.
  clientLatencyMs: z.number().min(0).max(1000).nullable().optional(),
});

export const TimeoutSyncDuelQuestionInputSchema = z.object({
  matchId: z.string().min(1),
});

// Time Sync schema (empty input)
export const GetServerTimeInputSchema = z.object({});

// Sync Duel decision finalize (cleanup fallback)
export const FinalizeSyncDuelDecisionInputSchema = z.object({
  matchId: z.string().min(1),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type CreateInviteInput = z.infer<typeof CreateInviteInputSchema>;
export type JoinInviteInput = z.infer<typeof JoinInviteInputSchema>;
export type CancelInviteInput = z.infer<typeof CancelInviteInputSchema>;
export type EnterQueueInput = z.infer<typeof EnterQueueInputSchema>;
export type LeaveQueueInput = z.infer<typeof LeaveQueueInputSchema>;
export type StartSyncDuelRoundInput = z.infer<typeof StartSyncDuelRoundInputSchema>;
export type SubmitSyncDuelAnswerInput = z.infer<typeof SubmitSyncDuelAnswerInputSchema>;
export type TimeoutSyncDuelQuestionInput = z.infer<typeof TimeoutSyncDuelQuestionInputSchema>;
export type GetServerTimeInput = z.infer<typeof GetServerTimeInputSchema>;
export type FinalizeSyncDuelDecisionInput = z.infer<typeof FinalizeSyncDuelDecisionInputSchema>;

/**
 * Strict parse - error fırlatır (API input validation için)
 * Invalid input gelirse exception fırlatır, bu durumda HttpsError'a çevrilir
 * 
 * Architecture Decision:
 * - null/undefined gelirse boş object'e çevir (CreateInviteInputSchema için)
 * - Diğer schema'lar için normal validation yap
 */
export function strictParse<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  // null/undefined gelirse boş object'e çevir (CreateInviteInputSchema için)
  const normalizedData = data === null || data === undefined ? {} : data;
  
  const result = schema.safeParse(normalizedData);

  if (result.success) {
    return result.data;
  }

  const contextMsg = context ? `[${context}] ` : "";
  const errorMsg = `${contextMsg}Validation failed: ${result.error.issues.map(e => e.message).join(", ")}`;
  
  throw new Error(errorMsg);
}

