/**
 * Home Page Logic Hook (React Query + Zustand Version)
 * 
 * Architecture Decision:
 * - Tüm page.tsx logic'i bu hook'a taşındı
 * - Component "dumb" kalır, sadece UI render eder
 * - State management: React Query (server state) + Zustand (client state)
 * - Global user state Zustand'dan alınır (energy, canPlay, etc.)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useAnonAuth } from "@/features/auth/useAnonAuth";
import { useUser } from "@/features/users/hooks/useUser.rq";
import { useActiveMatches } from "@/features/match/hooks/useActiveMatches.rq";
import { useUserStore } from "@/stores/userStore";
import { useMatchStore } from "@/stores/matchStore";
import {
  useCreateInviteMutation,
  useJoinInviteMutation,
  useCancelInviteMutation,
  useAutoRedirectOnJoin,
} from "@/features/match/hooks/useInviteMutations.rq";
import {
  useEnterQueueMutation,
  useLeaveQueueMutation,
} from "@/features/match/hooks/useMatchmakingMutations.rq";

export function useHomePageLogic() {
  // Auth
  const { user: authUser, ready, error: authError } = useAnonAuth();
  const uid = authUser?.uid ?? null;

  // User data (React Query + Zustand sync)
  const { user, loading: userLoading, error: userError } = useUser(uid);
  const { energy, activeMatchCount, canPlay } = useUserStore();

  // Invite state (Zustand)
  const { createdInviteCode, createdMatchId, copied, setInviteState, setCopied, resetInvite } =
    useMatchStore();

  // Queue state (Zustand)
  const { isQueuing, queueStatus, queueWaitSeconds, setQueueState, resetQueue } = useMatchStore();

  // UI state (local)
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Mutations (React Query)
  const createInviteMutation = useCreateInviteMutation();
  const joinInviteMutation = useJoinInviteMutation();
  const cancelInviteMutation = useCancelInviteMutation();
  const enterQueueMutation = useEnterQueueMutation();
  const leaveQueueMutation = useLeaveQueueMutation();

  // Active matches (React Query)
  const { matches: activeMatches, loading: activeLoading, error: activeError } =
    useActiveMatches(uid);

  // Auto-redirect when opponent joins (watch invite, not match)
  useAutoRedirectOnJoin(createdInviteCode);

  // Error handling
  useEffect(() => {
    const nextError =
      authError ??
      (userError ? userError.message || "User fetch failed" : null) ??
      (createInviteMutation.error ? createInviteMutation.error.message : null) ??
      (joinInviteMutation.error ? joinInviteMutation.error.message : null) ??
      (() => {
        if (!cancelInviteMutation.error) return null;
        const errorMsg = cancelInviteMutation.error.message;
        if (errorMsg.includes("CORS") || errorMsg.includes("fetch")) {
          return "İptal işlemi başarısız. Emulator'ı yeniden başlatmayı deneyin.";
        }
        return errorMsg;
      })() ??
      (() => {
        if (!enterQueueMutation.error) return null;
        const errorMsg = enterQueueMutation.error.message;
        if (errorMsg.includes("ENERGY_ZERO")) {
          return "Enerjin yok. Maç başlatmak için enerji refill'ini bekle ya da kutu aç!";
        }
        return errorMsg;
      })() ??
      null;

    // Guard: aynı error string'ini tekrar set etmeyelim (render loop riskini azaltır)
    setError((prev) => (prev === nextError ? prev : nextError));

    if (leaveQueueMutation.error) {
      console.error("Leave queue error:", leaveQueueMutation.error);
      // Leave queue error'ı kullanıcıya göstermeyiz (silent fail)
    }
  }, [
    authError,
    userError,
    createInviteMutation.error,
    joinInviteMutation.error,
    cancelInviteMutation.error,
    enterQueueMutation.error,
    leaveQueueMutation.error,
    setError,
  ]);

  // Computed values
  const canJoin = useMemo(() => joinCode.trim().length >= 4, [joinCode]);

  // Actions
  const onCreateInvite = () => {
    setError(null);
    setCopied(false);
    createInviteMutation.mutate(undefined);
  };

  const onCopy = async () => {
    if (!createdInviteCode) return;
    try {
      await navigator.clipboard.writeText(createdInviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setError("Kopyalanamadı. Kod: " + createdInviteCode);
    }
  };

  const onGoToMatch = () => {
    if (!createdMatchId) return;
    // Router navigation will be handled by mutation
  };

  const closeCreated = () => {
    resetInvite();
  };

  const onCancelInvite = () => {
    if (!createdInviteCode) return;
    setError(null);
    cancelInviteMutation.mutate(createdInviteCode);
  };

  const onJoin = () => {
    setError(null);
    const code = joinCode.trim().toUpperCase();
    joinInviteMutation.mutate(code);
  };

  // Matchmaking actions
  const onEnterQueue = () => {
    setError(null);
    // Random matchmaking: kategori sabit MATEMATIK
    enterQueueMutation.mutate("MATEMATIK");
  };

  const onLeaveQueue = () => {
    setError(null);
    resetQueue();
    leaveQueueMutation.mutate(undefined);
  };

  // Computed values (from Zustand + user data)
  const playDisabledReason =
    energy <= 0 ? "Enerji Yok" : activeMatchCount >= energy ? "Maç Kotası Dolu" : null;
  const cannotStartNewMatch = energy <= activeMatchCount;
  const cannotPlayAtAll = energy === 0;
  const startMatchReason = cannotPlayAtAll
    ? "Şu an enerjin yok. Maç başlatmak için refilli bekle ya da hemen kutu aç!"
    : cannotStartNewMatch
      ? "Şu an yeni maç başlatamazsın."
      : null;

  // Queue polling mechanism (QUEUED durumunda 4 saniyede bir enterQueue çağır)
  useEffect(() => {
    if (queueStatus !== "QUEUED" || enterQueueMutation.isPending) return;

    const POLL_INTERVAL_MS = 2000; // 2 saniye (bot threshold 5s için daha hızlı polling)
    const MAX_POLL_TIME_MS = 60000; // 60 saniye max

    let pollCount = 0;
    const maxPolls = Math.ceil(MAX_POLL_TIME_MS / POLL_INTERVAL_MS);
    let isCleanedUp = false;

    const pollInterval = setInterval(() => {
      if (isCleanedUp || enterQueueMutation.isPending) return;

      pollCount++;
      if (pollCount > maxPolls) {
        clearInterval(pollInterval);
        if (!isCleanedUp) {
          resetQueue();
          setError("Maç bulunamadı. Lütfen tekrar deneyin.");
        }
        return;
      }

      // Mutation kullanarak polling yap (kategori sabit MATEMATIK)
      enterQueueMutation.mutate("MATEMATIK", {
        onSuccess: (result) => {
          if (isCleanedUp) return;

          if (result.status === "MATCHED" && result.matchId) {
            clearInterval(pollInterval);
            // Redirect mutation hook'u içinde yapılıyor
          } else if (result.status === "QUEUED") {
            setQueueState("QUEUED", result.waitSeconds ?? pollCount * (POLL_INTERVAL_MS / 1000));
          }
        },
        onError: () => {
          if (isCleanedUp) return;
          clearInterval(pollInterval);
          resetQueue();
        },
      });
    }, POLL_INTERVAL_MS);

    return () => {
      isCleanedUp = true;
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueStatus, setQueueState, resetQueue, setError]);

  // Sayfadan ayrılırken queue'yu temizle (cleanup)
  // IMPORTANT: cleanup effect'i dependency değiştikçe çalışmasın diye isQueuing'i ref'te tutuyoruz.
  const isQueuingRef = useRef<boolean>(isQueuing);
  useEffect(() => {
    isQueuingRef.current = isQueuing;
  }, [isQueuing]);

  // leaveQueueMutation.mutate referansı bazı ortamlarda render'lar arasında değişebiliyor.
  // Onu dep'e koyarsak cleanup sürekli çalışır ve queue ticket'ını spam ile siler.
  // Bu yüzden mutate'i ref'te tutup cleanup'u SADECE unmount'ta çalıştırıyoruz.
  const leaveQueueMutateRef = useRef(leaveQueueMutation.mutate);
  useEffect(() => {
    leaveQueueMutateRef.current = leaveQueueMutation.mutate;
  }, [leaveQueueMutation.mutate]);

  useEffect(() => {
    return () => {
      if (isQueuingRef.current) {
        leaveQueueMutateRef.current(undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busy states (from mutations)
  const busy =
    enterQueueMutation.isPending || isQueuing
      ? "matchmaking"
      : createInviteMutation.isPending
        ? "create"
        : joinInviteMutation.isPending
          ? "join"
          : cancelInviteMutation.isPending
            ? "create"
            : null;

  return {
    // User data
    user,
    userLoading: userLoading || !ready,
    userError,
    uid,
    energy,
    activeMatchCount,

    // UI state
    joinCode,
    setJoinCode,
    busy,
    error,
    setError,

    // Invite modal
    createdInviteCode,
    createdMatchId,
    copied,
    closeCreated,
    onCopy,
    onGoToMatch,
    onCancelInvite,

    // Computed
    canJoin,
    canPlay,
    playDisabledReason,
    startMatchReason,

    // Actions
    onCreateInvite,
    onJoin,
    onEnterQueue,
    onLeaveQueue,

    // Queue state
    isQueuing,
    queueStatus,
    queueWaitSeconds,

    // Active matches
    activeMatches,
    activeLoading,
    activeError,
  };
}

