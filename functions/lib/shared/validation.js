"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinalizeSyncDuelDecisionInputSchema = exports.GetServerTimeInputSchema = exports.TimeoutSyncDuelQuestionInputSchema = exports.SubmitSyncDuelAnswerInputSchema = exports.StartSyncDuelRoundInputSchema = exports.LeaveQueueInputSchema = exports.EnterQueueInputSchema = exports.CancelInviteInputSchema = exports.JoinInviteInputSchema = exports.CreateInviteInputSchema = exports.ChoiceKeySchema = void 0;
exports.strictParse = strictParse;
const zod_1 = require("zod");
// ============================================================================
// ENUMS & LITERALS
// ============================================================================
exports.ChoiceKeySchema = zod_1.z.enum(["A", "B", "C", "D", "E"]);
// ============================================================================
// API INPUT SCHEMAS
// ============================================================================
// CreateInviteInputSchema - boş object bekliyor (null/undefined strictParse'da {}'ye çevrilir)
exports.CreateInviteInputSchema = zod_1.z.object({});
exports.JoinInviteInputSchema = zod_1.z.object({
    code: zod_1.z.string().min(4).max(10),
});
exports.CancelInviteInputSchema = zod_1.z.object({
    inviteId: zod_1.z.string().min(1),
});
// Matchmaking schemas
exports.EnterQueueInputSchema = zod_1.z.object({
    category: zod_1.z.enum(["BILIM", "COGRAFYA", "SPOR", "MATEMATIK"]),
});
exports.LeaveQueueInputSchema = zod_1.z.object({});
// Sync Duel schemas
exports.StartSyncDuelRoundInputSchema = zod_1.z.object({
    matchId: zod_1.z.string().min(1),
});
exports.SubmitSyncDuelAnswerInputSchema = zod_1.z.object({
    matchId: zod_1.z.string().min(1),
    roundId: zod_1.z.string().min(1),
    answer: exports.ChoiceKeySchema,
    clientElapsedMs: zod_1.z.number().min(0),
});
exports.TimeoutSyncDuelQuestionInputSchema = zod_1.z.object({
    matchId: zod_1.z.string().min(1),
});
// Time Sync schema (empty input)
exports.GetServerTimeInputSchema = zod_1.z.object({});
// Sync Duel decision finalize (cleanup fallback)
exports.FinalizeSyncDuelDecisionInputSchema = zod_1.z.object({
    matchId: zod_1.z.string().min(1),
});
/**
 * Strict parse - error fırlatır (API input validation için)
 * Invalid input gelirse exception fırlatır, bu durumda HttpsError'a çevrilir
 *
 * Architecture Decision:
 * - null/undefined gelirse boş object'e çevir (CreateInviteInputSchema için)
 * - Diğer schema'lar için normal validation yap
 */
function strictParse(schema, data, context) {
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
