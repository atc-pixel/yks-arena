// src/features/match/services/match.api.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { MatchDoc } from "@/lib/validation/schemas";
import type { SymbolKey } from "../types";
import {
  CreateInviteInputSchema,
  JoinInviteInputSchema,
  CancelInviteInputSchema,
  EnterQueueInputSchema,
  LeaveQueueInputSchema,
  StartSyncDuelRoundInputSchema, // Still using same schema name for backward compatibility
  SubmitSyncDuelAnswerInputSchema,
  TimeoutSyncDuelQuestionInputSchema,
  GetServerTimeInputSchema,
  FinalizeSyncDuelDecisionInputSchema,
  MarkSyncDuelDisconnectedInputSchema,
  MarkSyncDuelReconnectedInputSchema,
  type Category,
} from "@/lib/validation/schemas";
import { strictParse } from "@/lib/validation/utils";

export type CreateInviteResponse = { code: string }; // matchId will be created when opponent joins
export type JoinInviteResponse = { matchId: string };
export type CancelInviteResponse = { ok: boolean };

export type EnterQueueResult = {
  status: "MATCHED" | "QUEUED";
  matchId: string | null;
  opponentType: "HUMAN" | "BOT" | null;
  waitSeconds?: number;
};

export type LeaveQueueResponse = { success: boolean };

export type StartSyncDuelQuestionResponse = {
  questionId: string;
  serverStartAt: number;
};

export type SubmitSyncDuelAnswerResponse = {
  success: boolean;
};

export type TimeoutSyncDuelQuestionResponse = {
  success: boolean;
};

export type GetServerTimeResponse = {
  serverTimeMs: number;
};

export type FinalizeSyncDuelDecisionResponse = {
  success: boolean;
};

export type MarkSyncDuelDisconnectedResponse = { success: boolean };
export type MarkSyncDuelReconnectedResponse = { success: boolean };

// Callable names (tek yerden yönetelim)
const FN = {
  createInvite: "matchCreateInvite",
  joinInvite: "matchJoinInvite",
  cancelInvite: "cancelInvite", // <-- backend export ismine göre ayarla
  enterQueue: "matchEnterQueue",
  leaveQueue: "matchLeaveQueue",
  startSyncDuelQuestion: "matchStartSyncDuelQuestion",
  submitSyncDuelAnswer: "matchSubmitSyncDuelAnswer",
  timeoutSyncDuelQuestion: "matchTimeoutSyncDuelQuestion",
  getServerTime: "matchGetServerTime",
  finalizeSyncDuelDecision: "matchFinalizeSyncDuelDecision",
  markSyncDuelDisconnected: "matchMarkSyncDuelDisconnected",
  markSyncDuelReconnected: "matchMarkSyncDuelReconnected",
} as const;

/**
 * API Functions with Zod Input Validation
 * 
 * Architecture Decision:
 * - Tüm API input'ları Zod ile validate ediyoruz
 * - Invalid input gelirse exception fırlatır (UI'da error gösterilir)
 * - Type-safe input garantisi
 */

export async function ensureUserDoc() {
  // No input validation needed (empty input)
  const fn = httpsCallable<void, { success: boolean }>(functions, "ensureUserDocCallable");
  const res = await fn();
  return res.data;
}

export async function createInvite() {
  // No input validation needed (empty input)
  const fn = httpsCallable<void, CreateInviteResponse>(functions, FN.createInvite);
  const res = await fn();
  return res.data;
}

/**
 * Lobby UI basit kalsın diye sadece string alıyoruz.
 * Backend { code } bekliyor.
 * Zod validation ile code'un formatını kontrol ediyoruz.
 */
export async function joinInvite(code: string) {
  // Input validation
  const validated = strictParse(JoinInviteInputSchema, { code }, "joinInvite");
  
  const fn = httpsCallable<{ code: string }, JoinInviteResponse>(functions, FN.joinInvite);
  const res = await fn(validated);
  return res.data;
}

export async function cancelInvite(inviteId: string) {
  // Input validation
  const validated = strictParse(CancelInviteInputSchema, { inviteId }, "cancelInvite");
  
  const fn = httpsCallable<{ inviteId: string }, CancelInviteResponse>(functions, FN.cancelInvite);
  const res = await fn(validated);
  return res.data;
}

export async function enterQueue(category: Category) {
  // Input validation
  const validated = strictParse(EnterQueueInputSchema, { category }, "enterQueue");
  
  const fn = httpsCallable<{ category: Category }, EnterQueueResult>(functions, FN.enterQueue);
  const res = await fn(validated);
  return res.data;
}

export async function startSyncDuelQuestion(matchId: string) {
  // Input validation
  const validated = strictParse(StartSyncDuelRoundInputSchema, { matchId }, "startSyncDuelQuestion");
  
  const fn = httpsCallable<{ matchId: string }, StartSyncDuelQuestionResponse>(
    functions,
    FN.startSyncDuelQuestion
  );
  const res = await fn(validated);
  return res.data;
}

export async function submitSyncDuelAnswer(
  matchId: string,
  roundId: string,
  answer: string,
  clientElapsedMs: number,
  clientLatencyMs?: number | null
) {
  // Input validation
  const validated = strictParse(
    SubmitSyncDuelAnswerInputSchema,
    { matchId, roundId, answer, clientElapsedMs, clientLatencyMs: clientLatencyMs ?? null },
    "submitSyncDuelAnswer"
  );
  
  const fn = httpsCallable<
    { matchId: string; roundId: string; answer: string; clientElapsedMs: number; clientLatencyMs?: number | null },
    SubmitSyncDuelAnswerResponse
  >(functions, FN.submitSyncDuelAnswer);
  const res = await fn(validated);
  return res.data;
}

export async function timeoutSyncDuelQuestion(matchId: string) {
  const validated = strictParse(
    TimeoutSyncDuelQuestionInputSchema,
    { matchId },
    "timeoutSyncDuelQuestion"
  );

  const fn = httpsCallable<{ matchId: string }, TimeoutSyncDuelQuestionResponse>(
    functions,
    FN.timeoutSyncDuelQuestion
  );
  const res = await fn(validated);
  return res.data;
}

export async function getServerTime() {
  // Input validation (empty object)
  strictParse(GetServerTimeInputSchema, {}, "getServerTime");

  const fn = httpsCallable<void, GetServerTimeResponse>(functions, FN.getServerTime);
  const res = await fn();
  return res.data;
}

export async function finalizeSyncDuelDecision(matchId: string) {
  const validated = strictParse(
    FinalizeSyncDuelDecisionInputSchema,
    { matchId },
    "finalizeSyncDuelDecision"
  );

  const fn = httpsCallable<{ matchId: string }, FinalizeSyncDuelDecisionResponse>(
    functions,
    FN.finalizeSyncDuelDecision
  );
  const res = await fn(validated);
  return res.data;
}

export async function markSyncDuelDisconnected(matchId: string) {
  const validated = strictParse(MarkSyncDuelDisconnectedInputSchema, { matchId }, "markSyncDuelDisconnected");
  const fn = httpsCallable<{ matchId: string }, MarkSyncDuelDisconnectedResponse>(functions, FN.markSyncDuelDisconnected);
  const res = await fn(validated);
  return res.data;
}

export async function markSyncDuelReconnected(matchId: string) {
  const validated = strictParse(MarkSyncDuelReconnectedInputSchema, { matchId }, "markSyncDuelReconnected");
  const fn = httpsCallable<{ matchId: string }, MarkSyncDuelReconnectedResponse>(functions, FN.markSyncDuelReconnected);
  const res = await fn(validated);
  return res.data;
}

export async function leaveQueue() {
  // Input validation (empty object)
  strictParse(LeaveQueueInputSchema, {}, "leaveQueue");
  
  const fn = httpsCallable<void, LeaveQueueResponse>(functions, FN.leaveQueue);
  const res = await fn();
  return res.data;
}
