import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { ChoiceKey, MatchDoc, SymbolKey } from "../types";

export type CreateInviteResponse = { code: string; matchId: string };
export type JoinInviteResponse = { matchId: string };

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

export async function createInvite() {
  const fn = httpsCallable<void, CreateInviteResponse>(functions, "matchCreateInvite");
  const res = await fn();
  return res.data;
}

export async function joinInvite(code: string) {
  const fn = httpsCallable<{ code: string }, JoinInviteResponse>(functions, "matchJoinInvite");
  const res = await fn({ code });
  return res.data;
}

export async function spin(matchId: string) {
  const fn = httpsCallable<{ matchId: string }, SpinResponse>(functions, "matchSpin");
  const res = await fn({ matchId });
  return res.data;
}

export async function submitAnswer(matchId: string, answer: ChoiceKey) {
  const fn = httpsCallable<{ matchId: string; answer: ChoiceKey }, SubmitAnswerResponse>(
    functions,
    "matchSubmitAnswer"
  );
  const res = await fn({ matchId, answer });
  return res.data;
}
