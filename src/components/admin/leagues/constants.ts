/**
 * Admin Leagues Constants
 * 
 * Tier-specific renk paleti ve ikonları içerir.
 * Pop-Art design language'a uygun.
 */

import type { LeagueTier } from "@/lib/validation/schemas";

// Tier renk paleti - Pop-Art vibes 💥
export const TIER_COLORS: Record<LeagueTier, { bg: string; border: string; text: string; accent: string }> = {
  Diamond: { bg: "bg-cyan-400", border: "border-cyan-600", text: "text-cyan-900", accent: "bg-cyan-200" },
  Platinum: { bg: "bg-violet-400", border: "border-violet-600", text: "text-violet-900", accent: "bg-violet-200" },
  Gold: { bg: "bg-yellow-400", border: "border-yellow-600", text: "text-yellow-900", accent: "bg-yellow-200" },
  Silver: { bg: "bg-slate-300", border: "border-slate-500", text: "text-slate-900", accent: "bg-slate-100" },
  Bronze: { bg: "bg-orange-400", border: "border-orange-600", text: "text-orange-900", accent: "bg-orange-200" },
  Teneke: { bg: "bg-neutral-400", border: "border-neutral-600", text: "text-neutral-900", accent: "bg-neutral-200" },
};

// Tier ikonları
export const TIER_ICONS: Record<LeagueTier, string> = {
  Diamond: "💎",
  Platinum: "🏆",
  Gold: "🥇",
  Silver: "🥈",
  Bronze: "🥉",
  Teneke: "🥫",
};

