/**
 * Match Page Logic Hook
 * 
 * Architecture Decision:
 * - Tüm match page logic'i bu hook'a taşındı
 * - Component "dumb" kalır, sadece UI render eder
 * - State management ve business logic burada
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { useMatch } from "@/features/match/hooks/useMatch";
import { useQuestion } from "@/features/match/hooks/useQuestion";
import { spin, submitAnswer, continueToNextQuestion } from "@/features/match/services/match.api";
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

  const [busy, setBusy] = useState<"spin" | "answer" | null>(null);
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

  // Actions
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

    setBusy("spin");
    try {
      const res = await spin(matchId);
      return res;
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Spin failed (functions).";
      setError(errorMessage);
    } finally {
      setBusy(null);
    }
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

    setBusy("answer");
    try {
      await submitAnswer(matchId, answer);
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Answer submit failed (functions).";
      if (errorMessage.includes("ENERGY_ZERO")) {
        setError("Enerjin yok. Refill'i bekle ya da kutu aç!");
      } else {
        setError(errorMessage);
      }
      throw e;
    } finally {
      setBusy(null);
    }
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

    setBusy("answer");
    try {
      await continueToNextQuestion(matchId);
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Continue failed (functions).";
      setError(errorMessage);
      throw e;
    } finally {
      setBusy(null);
    }
  };

  const canSpin = Boolean(isMyTurn && phase === "SPIN" && busy === null);
  const canAnswer = Boolean(isMyTurn && phase === "QUESTION");
  const canContinue = Boolean(isMyTurn && phase === "RESULT" && busy === null);

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

