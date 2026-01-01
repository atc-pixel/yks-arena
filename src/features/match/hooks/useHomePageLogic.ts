/**
 * Home Page Logic Hook
 * 
 * Architecture Decision:
 * - Tüm page.tsx logic'i bu hook'a taşındı
 * - Component "dumb" kalır, sadece UI render eder
 * - State management ve business logic burada
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { MatchDocSchema } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import { createInvite, joinInvite, cancelInvite } from "@/features/match/services/match.api";
import { useAnonAuth } from "@/features/auth/useAnonAuth";
import { useUser } from "@/features/users/hooks/useUser";
import { useActiveMatches } from "@/features/match/hooks/useActiveMatches";

export function useHomePageLogic() {
  const router = useRouter();

  // Auth + realtime user
  const { user: authUser, ready, error: authError } = useAnonAuth();
  const uid = authUser?.uid ?? null;
  const { user, loading: userLoading, error: userError } = useUser(uid);

  // UI state
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Invite modal/state
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Active matches
  const { matches: activeMatches, loading: activeLoading, error: activeError } =
    useActiveMatches(uid);

  // Error handling
  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  // Auto-redirect when opponent joins
  useEffect(() => {
    if (!createdMatchId) return;

    const ref = doc(db, "matches", createdMatchId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;

      const m = safeParse(MatchDocSchema, snap.data(), `page:invite-wait:${createdMatchId}`);
      if (!m) return;

      if (m.status === "ACTIVE") {
        router.push(`/match/${createdMatchId}`);
      }
    });

    return () => unsub();
  }, [createdMatchId, router]);

  // Computed values
  const canJoin = useMemo(() => joinCode.trim().length >= 4, [joinCode]);
  const energy = user?.economy?.energy ?? 0;
  const activeMatchCount = user?.presence?.activeMatchCount ?? 0;
  const canPlay = energy > 0 && activeMatchCount < energy;

  const playDisabledReason =
    energy <= 0 ? "Enerji Yok" : activeMatchCount >= energy ? "Maç Kotası Dolu" : null;

  const cannotStartNewMatch = energy <= activeMatchCount;
  const cannotPlayAtAll = energy === 0;

  const startMatchReason = cannotPlayAtAll
    ? "Şu an enerjin yok. Maç başlatmak için refilli bekle ya da hemen kutu aç!"
    : cannotStartNewMatch
      ? "Şu an yeni maç başlatamazsın."
      : null;

  // Actions
  const onCreateInvite = async () => {
    setError(null);
    setCopied(false);
    setBusy("create");
    try {
      const res = await createInvite();
      setCreatedInviteCode(res.code);
      setCreatedMatchId(res.matchId);
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Davet oluşturulamadı.";
      setError(errorMessage);
    } finally {
      setBusy(null);
    }
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
    router.push(`/match/${createdMatchId}`);
  };

  const closeCreated = () => {
    setCreatedInviteCode(null);
    setCreatedMatchId(null);
    setCopied(false);
  };

  const onCancelInvite = async () => {
    if (!createdInviteCode) return;

    setError(null);
    setBusy("create");
    try {
      await cancelInvite(createdInviteCode);
      closeCreated();
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Davet iptal edilemedi.";
      setError(errorMessage);
    } finally {
      setBusy(null);
    }
  };

  const onJoin = async () => {
    setError(null);
    setBusy("join");
    try {
      const code = joinCode.trim().toUpperCase();
      const res = await joinInvite(code);
      router.push(`/match/${res.matchId}`);
    } catch (e: unknown) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Koda katılım başarısız.";
      setError(errorMessage);
    } finally {
      setBusy(null);
    }
  };

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

