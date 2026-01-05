/**
 * User Store (Zustand)
 * 
 * Architecture Decision:
 * - Global user state için Zustand kullanıyoruz
 * - User data her yerde erişilebilir (energy, profile, etc.)
 * - React Query ile sync edilir (server state)
 * - Client-side computed values (energy, canPlay) burada hesaplanır
 */

import { create } from "zustand";
import type { UserDoc } from "@/lib/validation/schemas";

type UserState = {
  user: UserDoc | null;
  setUser: (user: UserDoc | null) => void;
  // Computed values (derived from user)
  energy: number;
  activeMatchCount: number;
  canPlay: boolean;
};

/**
 * Zustand store for user state
 * 
 * Computed values otomatik hesaplanır (user değiştiğinde)
 */
export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  energy: 0,
  activeMatchCount: 0,
  canPlay: false,

  setUser: (user) => {
    const energy = user?.economy?.energy ?? 0;
    const activeMatchCount = user?.presence?.activeMatchCount ?? 0;
    const canPlay = energy > 0 && activeMatchCount < energy;

    set({
      user,
      energy,
      activeMatchCount,
      canPlay,
    });
  },
}));

