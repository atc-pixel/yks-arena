// src/features/match/services/match.api.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { ChoiceKey, MatchDoc, SymbolKey } from "../types";

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
  cancelInvite: "cancelInvite", // <-- backend export ismine göre ayarla
} as const;

export async function createInvite() {
  const fn = httpsCallable<void, CreateInviteResponse>(functions, FN.createInvite);
  const res = await fn();
  return res.data;
}

/**
 * Lobby UI basit kalsın diye sadece string alıyoruz.
 * Backend { code } bekliyor.
 */
export async function joinInvite(code: string) {
  const fn = httpsCallable<{ code: string }, JoinInviteResponse>(functions, FN.joinInvite);
  const res = await fn({ code });
  return res.data;
}

export async function spin(matchId: string) {
  const fn = httpsCallable<{ matchId: string }, SpinResponse>(functions, FN.spin);
  const res = await fn({ matchId });
  return res.data;
}

export async function submitAnswer(matchId: string, answer: ChoiceKey) {
  const fn = httpsCallable<{ matchId: string; answer: ChoiceKey }, SubmitAnswerResponse>(
    functions,
    FN.submitAnswer
  );
  const res = await fn({ matchId, answer });
  return res.data;
}

export async function cancelInvite(inviteId: string) {
  const fn = httpsCallable<{ inviteId: string }, CancelInviteResponse>(functions, FN.cancelInvite);
  const res = await fn({ inviteId });
  return res.data;
}
