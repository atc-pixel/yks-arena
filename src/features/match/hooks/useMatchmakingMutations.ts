/**
 * Matchmaking Mutations (React Query)
 * 
 * Architecture Decision:
 * - Matchmaking-related mutations burada toplanır
 * - Zustand store ile sync edilir (UI state için)
 * - QUEUED durumunda polling mekanizması kullanılır (useHomePageLogic'te)
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { enterQueue, leaveQueue } from "@/features/match/services/match.api";
import { useMatchStore } from "@/stores/matchStore";
import type { Category } from "@/lib/validation/schemas";

/**
 * Enter queue mutation
 * MATCHED durumunda otomatik redirect yapar
 */
export function useEnterQueueMutation() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const setQueueState = useMatchStore((state) => state.setQueueState);
  const resetQueue = useMatchStore((state) => state.resetQueue);

  return useMutation({
    mutationFn: (category: Category) => enterQueue(category),
    onSuccess: (data) => {
      if (data.status === "MATCHED" && data.matchId) {
        // Match bulundu, redirect et
        resetQueue();
        queryClient.invalidateQueries({ queryKey: ["activeMatches"] });
        router.push(`/match/${data.matchId}`);
      } else if (data.status === "QUEUED") {
        // Queue'da bekleme durumu
        setQueueState("QUEUED", data.waitSeconds ?? 0);
      }
    },
    onError: () => {
      resetQueue();
    },
  });
}

/**
 * Leave queue mutation
 */
export function useLeaveQueueMutation() {
  const resetQueue = useMatchStore((state) => state.resetQueue);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leaveQueue,
    onSuccess: () => {
      resetQueue();
      queryClient.invalidateQueries({ queryKey: ["activeMatches"] });
    },
    onError: (error) => {
      console.error("Leave queue error:", error);
      // Error olsa bile queue state'i reset et (UX için)
      resetQueue();
    },
  });
}
