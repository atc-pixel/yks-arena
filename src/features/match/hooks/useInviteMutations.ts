/**
 * Invite Mutations (React Query)
 * 
 * Architecture Decision:
 * - Invite-related mutations burada toplanır
 * - Zustand store ile sync edilir (UI state için)
 */

"use client";

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { MatchDocSchema } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import { createInvite, joinInvite, cancelInvite } from "@/features/match/services/match.api";
import { useMatchStore } from "@/stores/matchStore";

/**
 * Create invite mutation
 */
export function useCreateInviteMutation() {
  const queryClient = useQueryClient();
  const setInviteState = useMatchStore((state) => state.setInviteState);
  const resetInvite = useMatchStore((state) => state.resetInvite);

  return useMutation({
    mutationFn: createInvite,
    onSuccess: (data) => {
      // Zustand store'a kaydet (matchId yok, sadece code var)
      // matchId will be created when opponent joins
      setInviteState(data.code, null);
    },
    onError: () => {
      resetInvite();
    },
  });
}

/**
 * Join invite mutation
 */
export function useJoinInviteMutation() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (code: string) => joinInvite(code),
    onSuccess: (data) => {
      // Match cache'ini invalidate et
      queryClient.invalidateQueries({ queryKey: ["match", data.matchId] });
      
      // Navigate to match
      router.push(`/match/${data.matchId}`);
    },
  });
}

/**
 * Cancel invite mutation
 */
export function useCancelInviteMutation() {
  const resetInvite = useMatchStore((state) => state.resetInvite);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => cancelInvite(inviteId),
    onSuccess: () => {
      resetInvite();
      // Invalidate active matches to refresh the list
      queryClient.invalidateQueries({ queryKey: ["activeMatches"] });
    },
    onError: (error) => {
      console.error("Cancel invite error:", error);
      // Error'da da modal'ı kapat (UX için)
      // Ama invite cancel edilmemiş olabilir, kullanıcıya bilgi ver
      resetInvite();
    },
  });
}

/**
 * Auto-redirect hook when opponent joins
 * 
 * Architecture Decision:
 * - Created invite'te opponent join edince otomatik redirect
 * - Invite document'ini watch ediyoruz, matchId geldiğinde redirect yapıyoruz
 */
export function useAutoRedirectOnJoin(inviteCode: string | null) {
  const router = useRouter();
  const pathname = usePathname();
  const setInviteState = useMatchStore((state) => state.setInviteState);

  useEffect(() => {
    if (!inviteCode) return;
    
    // Sadece anasayfada çalış (match sayfasında değil)
    if (pathname?.startsWith("/match/")) return;

    const ref = doc(db, "invites", inviteCode);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;

      const invite = snap.data();
      const matchId = invite?.matchId;
      const status = invite?.status;

      // When opponent joins, invite gets matchId and status becomes "USED"
      if (matchId && status === "USED") {
        // Update Zustand store with matchId
        setInviteState(inviteCode, matchId);
        // Redirect to match (sadece anasayfadaysak)
        if (pathname === "/") {
          router.push(`/match/${matchId}`);
        }
      }
    });

    return () => unsub();
  }, [inviteCode, router, setInviteState, pathname]);
}

