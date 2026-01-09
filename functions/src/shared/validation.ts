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

// Matchmaking schemas
export const EnterQueueInputSchema = z.object({
  // forceBot kaldırıldı - 15s sonra otomatik bot dahil edilir
});

export const LeaveQueueInputSchema = z.object({});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type CreateInviteInput = z.infer<typeof CreateInviteInputSchema>;
export type JoinInviteInput = z.infer<typeof JoinInviteInputSchema>;
export type SpinInput = z.infer<typeof SpinInputSchema>;
export type SubmitAnswerInput = z.infer<typeof SubmitAnswerInputSchema>;
export type ContinueToNextQuestionInput = z.infer<typeof ContinueToNextQuestionInputSchema>;
export type CancelInviteInput = z.infer<typeof CancelInviteInputSchema>;
export type EnterQueueInput = z.infer<typeof EnterQueueInputSchema>;
export type LeaveQueueInput = z.infer<typeof LeaveQueueInputSchema>;

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

