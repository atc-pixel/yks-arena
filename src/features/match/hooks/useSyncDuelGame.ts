/**
 * useSyncDuelGame Hook
 * 
 * Architecture Decision:
 * - Sync duel match'in tüm logic'i bu hook'ta
 * - Component "dumb" kalır, sadece UI render eder
 * - State management: React Query (server state) + mutations
 * - Client-side timing: performance.now() ile clientElapsedMs hesapla
 * - 60 saniye timeout: client-side timer
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { useMatch } from "@/features/match/hooks/useMatch.rq";
import { useQuestion } from "@/features/match/hooks/useQuestion.rq";
import {
  useStartSyncDuelQuestionMutation,
  useSubmitSyncDuelAnswerMutation,
  useTimeoutSyncDuelQuestionMutation,
} from "@/features/match/hooks/useMatchMutations";
import type { ChoiceKey, MatchDoc } from "@/lib/validation/schemas";

export function useSyncDuelGame(matchId: string) {
  const router = useRouter();
  const { match, loading } = useMatch(matchId);
  const myUid = auth.currentUser?.uid ?? null;

  // Client-side timing (performance.now() - monotonic)
  const questionStartTimeRef = useRef<number | null>(null); // performance.now() değeri
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRequestedForQuestionIdRef = useRef<string | null>(null);
  const autoStartKeyRef = useRef<string | null>(null);

  // Mutations
  const startQuestionMutation = useStartSyncDuelQuestionMutation();
  const submitAnswerMutation = useSubmitSyncDuelAnswerMutation();
  const timeoutQuestionMutation = useTimeoutSyncDuelQuestionMutation();

  const [error, setError] = useState<string | null>(null);

  // Derived state
  const players = (match?.players ?? []) as string[];
  const oppUid = useMemo(() => {
    if (!myUid) return null;
    return players.find((u) => u !== myUid) ?? null;
  }, [players, myUid]);

  const syncDuel = match?.syncDuel;
  const currentQuestion = syncDuel?.questions[syncDuel.currentQuestionIndex] ?? null;
  const currentQuestionIndex = syncDuel?.currentQuestionIndex ?? -1;
  const matchStatus = syncDuel?.matchStatus ?? "WAITING_PLAYERS";
  const correctCounts = syncDuel?.correctCounts ?? {};
  const myCorrectCount = myUid ? (correctCounts[myUid] ?? 0) : 0;
  const oppCorrectCount = oppUid ? (correctCounts[oppUid] ?? 0) : 0;

  // Current question
  const currentQuestionId = currentQuestion?.questionId ?? null;
  const { question, loading: questionLoading } = useQuestion(currentQuestionId);

  // My answer state (current question)
  const myAnswer = useMemo(() => {
    if (!currentQuestion || !myUid) return null;
    return currentQuestion.answers[myUid] ?? null;
  }, [currentQuestion, myUid]);

  const hasAnswered = myAnswer?.choice !== null;

  // Can start question
  const canStartQuestion = matchStatus === "WAITING_PLAYERS" || matchStatus === "QUESTION_RESULT";

  // Can answer (question active, haven't answered yet)
  const canAnswer = matchStatus === "QUESTION_ACTIVE" && !hasAnswered;

  // Redirect when match finishes
  useEffect(() => {
    if (match?.status === "FINISHED") {
      router.push(`/results/${matchId}`);
    }
  }, [match?.status, matchId, router]);

  // Error handling from mutations
  useEffect(() => {
    if (startQuestionMutation.error) setError(startQuestionMutation.error.message);
    if (submitAnswerMutation.error) setError(submitAnswerMutation.error.message);
    if (timeoutQuestionMutation.error) {
      // Non-critical (idempotent / multi-client race), show only dev
      if (process.env.NODE_ENV === "development") {
        console.warn("Timeout mutation error (non-critical):", timeoutQuestionMutation.error);
      }
    }
  }, [startQuestionMutation.error, submitAnswerMutation.error, timeoutQuestionMutation.error]);

  // Reload fallback: QUESTION_ACTIVE iken ref boşsa (sayfa yenilendi), tahmini start time üret
  useEffect(() => {
    if (!currentQuestion || matchStatus !== "QUESTION_ACTIVE") return;
    if (questionStartTimeRef.current !== null) return;

    const serverElapsedMs = Math.max(0, Date.now() - currentQuestion.serverStartAt);
    // performance.now() bazını Date.now() ile karıştırmıyoruz; sadece fark için kullanıyoruz.
    questionStartTimeRef.current = performance.now() - serverElapsedMs;
  }, [currentQuestion?.questionId, matchStatus, currentQuestion?.serverStartAt]);

  // 60 saniye timeout timer
  useEffect(() => {
    if (!currentQuestion || matchStatus !== "QUESTION_ACTIVE") {
      // Clear timeout if question ended or not active
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }
      timeoutRequestedForQuestionIdRef.current = null;
      return;
    }

    // Per-question idempotency: aynı soru için timeout mutation'ını en fazla 1 kez tetikle
    if (timeoutRequestedForQuestionIdRef.current !== currentQuestion.questionId) {
      timeoutRequestedForQuestionIdRef.current = null;
    }

    // Calculate remaining time
    const elapsedMs = Date.now() - currentQuestion.serverStartAt;
    const remainingMs = Math.max(0, 60000 - elapsedMs);

    if (remainingMs > 0) {
      timeoutTimerRef.current = setTimeout(() => {
        // Timeout reached - backend transition (idempotent)
        if (timeoutRequestedForQuestionIdRef.current === null) {
          timeoutRequestedForQuestionIdRef.current = currentQuestion.questionId;
          timeoutQuestionMutation.mutate(matchId);
        }
      }, remainingMs);
    } else {
      // Zaten timeout olmuş olabilir; server state update'i kaçırdıysak tetikle
      if (timeoutRequestedForQuestionIdRef.current === null) {
        timeoutRequestedForQuestionIdRef.current = currentQuestion.questionId;
        timeoutQuestionMutation.mutate(matchId);
      }
    }

    return () => {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }
    };
  }, [currentQuestion?.questionId, currentQuestion?.serverStartAt, matchStatus, matchId, timeoutQuestionMutation]);

  // Auto-flow: Butonsuz akış
  // - İlk soru: WAITING_PLAYERS + currentQuestionIndex === -1 → kısa gecikmeyle auto start
  // - Sonraki soru: QUESTION_RESULT → kısa gecikmeyle auto start
  useEffect(() => {
    if (!match) return;
    if (!myUid) return;
    if (!canStartQuestion) return;
    if (match.status !== "ACTIVE") return;
    if (startQuestionMutation.isPending) return;

    const isFirstQuestion = matchStatus === "WAITING_PLAYERS" && currentQuestionIndex === -1;
    const isBetweenQuestions = matchStatus === "QUESTION_RESULT" && !!currentQuestion?.endedAt;
    if (!isFirstQuestion && !isBetweenQuestions) return;

    // Aynı state için tekrar tetiklemeyi engelle
    const key = `${matchStatus}:${currentQuestionIndex}:${currentQuestion?.endedAt ?? "na"}`;
    if (autoStartKeyRef.current === key) return;

    // ÖNEMLİ: key'i timeout callback içinde set etmek render-loop'ta çoklu schedule'a yol açabiliyor.
    // Schedule anında set ederek aynı key için sadece 1 kez tetikleriz.
    autoStartKeyRef.current = key;

    const delayMs = isBetweenQuestions ? 900 : 300;
    const t = setTimeout(() => {
      startQuestionMutation.mutate(matchId);
    }, delayMs);

    return () => clearTimeout(t);
  }, [
    match,
    myUid,
    canStartQuestion,
    matchStatus,
    currentQuestionIndex,
    currentQuestion?.endedAt,
    matchId,
    startQuestionMutation,
  ]);

  // Actions
  const startQuestion = async () => {
    if (!canStartQuestion || startQuestionMutation.isPending) return;

    setError(null);

    try {
      const result = await startQuestionMutation.mutateAsync(matchId);

      // Question başlangıcında performance.now() kaydet (monotonic)
      questionStartTimeRef.current = performance.now();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Soru başlatılamadı";
      setError(errorMsg);
    }
  };

  const submitAnswer = async (answer: ChoiceKey) => {
    if (!canAnswer || !currentQuestion || submitAnswerMutation.isPending) return;

    setError(null);

    try {
      if (questionStartTimeRef.current === null) {
        // Reload / edge-case: ref yoksa tahmini başlat
        const serverElapsedMs = Math.max(0, Date.now() - currentQuestion.serverStartAt);
        questionStartTimeRef.current = performance.now() - serverElapsedMs;
      }

      // Client-side elapsed time (UX için)
      const submitTime = performance.now();
      const clientElapsedMs = submitTime - (questionStartTimeRef.current ?? submitTime);

      // roundId artık kullanılmıyor ama validation için hala gerekli (backward compatibility)
      // Backend'de ignore ediliyor, currentQuestionIndex kullanılıyor
      await submitAnswerMutation.mutateAsync({
        matchId,
        roundId: currentQuestion.questionId, // Temporary: using questionId as roundId for validation
        answer,
        clientElapsedMs,
      });

      // Reset question start time
      questionStartTimeRef.current = null;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Cevap gönderilemedi";
      setError(errorMsg);
    }
  };

  // Busy state
  const busy = startQuestionMutation.isPending || submitAnswerMutation.isPending ? true : null;

  return {
    match,
    loading,
    myUid,
    oppUid,
    syncDuel,
    currentQuestion,
    currentQuestionIndex,
    matchStatus,
    myCorrectCount,
    oppCorrectCount,
    question,
    questionLoading,
    myAnswer,
    hasAnswered,
    canStartQuestion,
    canAnswer,
    busy,
    error,
    startQuestion,
    submitAnswer,
  };
}
