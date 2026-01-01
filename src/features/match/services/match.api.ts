// src/features/match/services/match.api.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { MatchDoc } from "@/lib/validation/schemas";
import type { SymbolKey } from "../types";
import {
  CreateInviteInputSchema,
  JoinInviteInputSchema,
  SpinInputSchema,
  SubmitAnswerInputSchema,
  ContinueToNextQuestionInputSchema,
  CancelInviteInputSchema,
} from "@/lib/validation/schemas";
import { strictParse } from "@/lib/validation/utils";

export type CreateInviteResponse = { code: string; matchId: string };
export type JoinInviteResponse = { matchId: string };
export type CancelInviteResponse = { ok: boolean };

export type SpinResponse = {
  matchId: string;
  symbol: SymbolKey;
  questionId: string;
};

export type SubmitAnswerResponse = {
  matchId: string;
  status: MatchDoc["status"];
  phase: MatchDoc["turn"]["phase"];
};

// Callable names (tek yerden yönetelim)
const FN = {
  createInvite: "matchCreateInvite",
  joinInvite: "matchJoinInvite",
  spin: "matchSpin",
  submitAnswer: "matchSubmitAnswer",
  continueToNextQuestion: "matchContinueToNextQuestion",
  cancelInvite: "cancelInvite", // <-- backend export ismine göre ayarla
} as const;

/**
 * API Functions with Zod Input Validation
 * 
 * Architecture Decision:
 * - Tüm API input'ları Zod ile validate ediyoruz
 * - Invalid input gelirse exception fırlatır (UI'da error gösterilir)
 * - Type-safe input garantisi
 */

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

export async function spin(matchId: string) {
  // Input validation
  const validated = strictParse(SpinInputSchema, { matchId }, "spin");
  
  const fn = httpsCallable<{ matchId: string }, SpinResponse>(functions, FN.spin);
  const res = await fn(validated);
  return res.data;
}

export async function submitAnswer(matchId: string, answer: string) {
  // Input validation (answer ChoiceKey olmalı)
  const validated = strictParse(SubmitAnswerInputSchema, { matchId, answer }, "submitAnswer");
  
  const fn = httpsCallable<{ matchId: string; answer: string }, SubmitAnswerResponse>(
    functions,
    FN.submitAnswer
  );
  const res = await fn(validated);
  return res.data;
}

export async function continueToNextQuestion(matchId: string) {
  // Input validation
  const validated = strictParse(ContinueToNextQuestionInputSchema, { matchId }, "continueToNextQuestion");
  
  const fn = httpsCallable<{ matchId: string }, SubmitAnswerResponse>(
    functions,
    FN.continueToNextQuestion
  );
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
