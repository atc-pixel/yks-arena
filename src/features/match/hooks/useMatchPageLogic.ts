/**
 * Match Page Logic Hook (React Query + Zustand Version)
 * 
 * Architecture Decision:
 * - Tüm match page logic'i bu hook'a taşındı
 * - Component "dumb" kalır, sadece UI render eder
 * - State management: React Query (server state) + mutations
 * - Optimistic updates için React Query mutations kullanıyoruz
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { useMatch } from "@/features/match/hooks/useMatch.rq";
import { useQuestion } from "@/features/match/hooks/useQuestion.rq";
import {
  useSpinMutation,
  useSubmitAnswerMutation,
  useContinueToNextQuestionMutation,
} from "@/features/match/hooks/useMatchMutations";
import type { ChoiceKey, SymbolKey, PlayerState, TurnLastResult } from "@/lib/validation/schemas";

export function useMatchPageLogic(matchId: string) {
  const router = useRouter();
  const { match, loading } = useMatch(matchId);
  const myUid = auth.currentUser?.uid ?? null;

  const players = (match?.players ?? []) as string[];
  const oppUid = useMemo(() => {
    if (!myUid) return null;
    return players.find((u) => u !== myUid) ?? null;
  }, [players, myUid]);

  const isMyTurn = match?.turn?.currentUid === myUid;
  const phase = (match?.turn?.phase ?? "SPIN") as string;
  const activeQuestionId = (match?.turn?.activeQuestionId ?? null) as string | null;
  const challengeSymbol = (match?.turn?.challengeSymbol ?? null) as SymbolKey | null;

  const { question, loading: questionLoading } = useQuestion(activeQuestionId);

  // Mutations (React Query)
  const spinMutation = useSpinMutation();
  const submitAnswerMutation = useSubmitAnswerMutation();
  const continueMutation = useContinueToNextQuestionMutation();

  const [error, setError] = useState<string | null>(null);

  // Type-safe player state extraction
  const myState: PlayerState | undefined = myUid ? match?.stateByUid?.[myUid] : undefined;
  const oppState: PlayerState | undefined = oppUid ? match?.stateByUid?.[oppUid] : undefined;

  const lastResult = (match?.turn?.lastResult ?? null) as TurnLastResult | null;

  // Redirect when match finishes
  useEffect(() => {
    if (match?.status === "FINISHED") {
      router.push(`/results/${matchId}`);
    }
  }, [match?.status, matchId, router]);

  // Error handling from mutations
  useEffect(() => {
    if (spinMutation.error) setError(spinMutation.error.message);
    if (submitAnswerMutation.error) {
      const errorMsg = submitAnswerMutation.error.message;
      if (errorMsg.includes("ENERGY_ZERO")) {
        setError("Enerjin yok. Refill'i bekle ya da kutu aç!");
      } else {
        setError(errorMsg);
      }
    }
    if (continueMutation.error) setError(continueMutation.error.message);
  }, [spinMutation.error, submitAnswerMutation.error, continueMutation.error]);

  // Actions (using mutations)
  const onSpin = async () => {
    setError(null);

    if (!isMyTurn) {
      setError("Sıra sende değil.");
      return;
    }
    if (phase !== "SPIN") {
      setError("Şu an spin aşamasında değilsin.");
      return;
    }

    spinMutation.mutate(matchId);
  };

  const onSubmit = async (answer: ChoiceKey) => {
    setError(null);

    if (!isMyTurn) {
      setError("Sıra sende değil.");
      return;
    }
    if (phase !== "QUESTION") {
      setError("Şu an soru aşamasında değilsin.");
      return;
    }
    if (!activeQuestionId) {
      setError("activeQuestionId yok. Backend state'i kontrol et.");
      return;
    }

    submitAnswerMutation.mutate({ matchId, answer });
  };

  const onContinue = async () => {
    setError(null);

    if (!isMyTurn) {
      setError("Sıra sende değil.");
      return;
    }
    if (phase !== "RESULT") {
      setError("Şu an sonuç aşamasında değilsin.");
      return;
    }

    continueMutation.mutate(matchId);
  };

  // Busy states from mutations
  const busy = spinMutation.isPending ? "spin" : submitAnswerMutation.isPending || continueMutation.isPending ? "answer" : null;

  const canSpin = Boolean(isMyTurn && phase === "SPIN" && !spinMutation.isPending);
  const canAnswer = Boolean(isMyTurn && phase === "QUESTION" && !submitAnswerMutation.isPending);
  const canContinue = Boolean(isMyTurn && phase === "RESULT" && !continueMutation.isPending);

  return {
    // Match data
    match,
    loading,
    myUid,
    oppUid,
    isMyTurn,
    phase,
    activeQuestionId,
    challengeSymbol,

    // Question data
    question,
    questionLoading,

    // Player states
    myState,
    oppState,
    lastResult,

    // UI state
    busy,
    error,

    // Actions
    onSpin,
    onSubmit,
    onContinue,

    // Computed
    canSpin,
    canAnswer,
    canContinue,
  };
}

