/**
 * Home Page Logic Hook (React Query + Zustand Version)
 * 
 * Architecture Decision:
 * - Tüm page.tsx logic'i bu hook'a taşındı
 * - Component "dumb" kalır, sadece UI render eder
 * - State management: React Query (server state) + Zustand (client state)
 * - Global user state Zustand'dan alınır (energy, canPlay, etc.)
 */

import { useEffect, useMemo, useState } from "react";
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
} from "@/features/match/hooks/useInviteMutations";

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

  // UI state (local)
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Mutations (React Query)
  const createInviteMutation = useCreateInviteMutation();
  const joinInviteMutation = useJoinInviteMutation();
  const cancelInviteMutation = useCancelInviteMutation();

  // Active matches (React Query)
  const { matches: activeMatches, loading: activeLoading, error: activeError } =
    useActiveMatches(uid);

  // Auto-redirect when opponent joins (watch invite, not match)
  useAutoRedirectOnJoin(createdInviteCode);

  // Error handling
  useEffect(() => {
    if (authError) setError(authError);
    if (userError) setError(userError?.message || "User fetch failed");
    if (createInviteMutation.error) setError(createInviteMutation.error.message);
    if (joinInviteMutation.error) setError(joinInviteMutation.error.message);
    if (cancelInviteMutation.error) {
      const errorMsg = cancelInviteMutation.error.message;
      // CORS veya network hatalarında daha açıklayıcı mesaj
      if (errorMsg.includes("CORS") || errorMsg.includes("fetch")) {
        setError("İptal işlemi başarısız. Emulator'ı yeniden başlatmayı deneyin.");
      } else {
        setError(errorMsg);
      }
    }
  }, [authError, userError, createInviteMutation.error, joinInviteMutation.error, cancelInviteMutation.error]);

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

  // Busy states (from mutations)
  const busy = createInviteMutation.isPending
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

    // Active matches
    activeMatches,
    activeLoading,
    activeError,
  };
}

