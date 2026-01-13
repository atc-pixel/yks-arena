/**
 * Match Mutations (React Query)
 * 
 * Architecture Decision:
 * - Tüm match mutation'ları burada toplanır
 * - Optimistic updates için React Query mutation kullanıyoruz
 * - submitAnswer için optimistic update eklenir (UI anında güncellenir)
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  startSyncDuelQuestion,
  submitSyncDuelAnswer,
  timeoutSyncDuelQuestion,
  finalizeSyncDuelDecision,
} from "@/features/match/services/match.api";
import type { ChoiceKey } from "@/lib/validation/schemas";

/**
 * Start sync duel question mutation
 */
export function useStartSyncDuelQuestionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: string) => startSyncDuelQuestion(matchId),
    onSuccess: (data, matchId) => {
      // Match cache'ini invalidate et (yeni question data'sı için)
      queryClient.invalidateQueries({ queryKey: ["match", matchId] });
    },
  });
}

/**
 * Submit sync duel answer mutation
 */
export function useSubmitSyncDuelAnswerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      matchId,
      roundId,
      answer,
      clientElapsedMs,
    }: {
      matchId: string;
      roundId: string;
      answer: ChoiceKey;
      clientElapsedMs: number;
    }) => submitSyncDuelAnswer(matchId, roundId, answer, clientElapsedMs),
    onSuccess: (data, variables) => {
      // Match cache'ini invalidate et (cevap kaydedildi, round state güncellendi)
      queryClient.invalidateQueries({ queryKey: ["match", variables.matchId] });
    },
  });
}

/**
 * Timeout sync duel question mutation
 */
export function useTimeoutSyncDuelQuestionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: string) => timeoutSyncDuelQuestion(matchId),
    onSuccess: (data, matchId) => {
      // Match cache'ini invalidate et (QUESTION_RESULT update'i için)
      queryClient.invalidateQueries({ queryKey: ["match", matchId] });
    },
  });
}

/**
 * Finalize sync duel decision mutation (cleanup fallback)
 */
export function useFinalizeSyncDuelDecisionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: string) => finalizeSyncDuelDecision(matchId),
    onSuccess: (data, matchId) => {
      queryClient.invalidateQueries({ queryKey: ["match", matchId] });
    },
  });
}
