/**
 * Match Store (Zustand)
 * 
 * Architecture Decision:
 * - Client-side match UI state için Zustand kullanıyoruz
 * - Server state (match data) React Query'de kalır
 * - Bu store sadece UI state için (modal açık/kapalı, selected answer, etc.)
 */

import { create } from "zustand";
import type { ChoiceKey } from "@/lib/validation/schemas";

type MatchUIState = {
  // Invite modal state
  createdInviteCode: string | null;
  createdMatchId: string | null; // Will be set when opponent joins
  copied: boolean;
  setInviteState: (code: string | null, matchId: string | null) => void;
  setCopied: (copied: boolean) => void;
  resetInvite: () => void;

  // Question panel UI state (local, component-specific olabilir ama global de tutabiliriz)
  selectedAnswer: ChoiceKey | null;
  setSelectedAnswer: (answer: ChoiceKey | null) => void;
};

export const useMatchStore = create<MatchUIState>((set) => ({
  // Invite state
  createdInviteCode: null,
  createdMatchId: null,
  copied: false,
  setInviteState: (code, matchId) => set({ createdInviteCode: code, createdMatchId: matchId }),
  setCopied: (copied) => set({ copied }),
  resetInvite: () => set({ createdInviteCode: null, createdMatchId: null, copied: false }),

  // Question state
  selectedAnswer: null,
  setSelectedAnswer: (answer) => set({ selectedAnswer: answer }),
}));

