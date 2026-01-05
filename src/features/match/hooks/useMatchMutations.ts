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
import { spin, submitAnswer, continueToNextQuestion } from "@/features/match/services/match.api";
import type { ChoiceKey } from "@/lib/validation/schemas";
import type { MatchDoc } from "@/lib/validation/schemas";

/**
 * Spin mutation
 */
export function useSpinMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: string) => spin(matchId),
    onSuccess: (data) => {
      // Match cache'ini invalidate et (yeni turn data'sı için)
      queryClient.invalidateQueries({ queryKey: ["match", data.matchId] });
    },
  });
}

/**
 * Submit Answer mutation with optimistic updates
 * 
 * Optimistic Update Strategy:
 * 1. UI'ı hemen güncelle (answer gönderildi, processing state)
 * 2. Firestore'dan gerçek data gelince doğrula
 * 3. Hata olursa geri al
 */
export function useSubmitAnswerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ matchId, answer }: { matchId: string; answer: ChoiceKey }) =>
      submitAnswer(matchId, answer),
    onMutate: async ({ matchId, answer }) => {
      // Cancel outgoing refetches (optimistic update için)
      await queryClient.cancelQueries({ queryKey: ["match", matchId] });

      // Snapshot previous value (rollback için)
      const previousMatch = queryClient.getQueryData<MatchDoc>(["match", matchId]);

      // Optimistically update UI
      if (previousMatch) {
        queryClient.setQueryData<MatchDoc>(["match", matchId], {
          ...previousMatch,
          turn: {
            ...previousMatch.turn,
            // Processing state göster (lastResult henüz yok, ama answer gönderildi)
            // Gerçek lastResult Firestore'dan gelecek
          },
        });
      }

      return { previousMatch };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousMatch) {
        queryClient.setQueryData(["match", variables.matchId], context.previousMatch);
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate match query (gerçek data ile güncelle)
      queryClient.invalidateQueries({ queryKey: ["match", variables.matchId] });
    },
  });
}

/**
 * Continue to next question mutation
 */
export function useContinueToNextQuestionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matchId: string) => continueToNextQuestion(matchId),
    onSuccess: (data, matchId) => {
      // Match cache'ini invalidate et (yeni question için)
      queryClient.invalidateQueries({ queryKey: ["match", matchId] });
    },
  });
}

