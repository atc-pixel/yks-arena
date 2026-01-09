"use client";

import type { LeagueTier } from "@/lib/validation/schemas";
import { TIER_ICONS } from "./constants";

type EmptyTierStateProps = {
  tier: LeagueTier;
};

export function EmptyTierState({ tier }: EmptyTierStateProps) {
  return (
    <div className="text-center py-8">
      <div className="text-6xl mb-3 opacity-50">{TIER_ICONS[tier]}</div>
      <p className="text-neutral-500 font-bold">Bu ligde henüz bucket yok</p>
      <p className="text-neutral-400 text-sm">Oyuncular maç oynayınca bucket&apos;lar oluşacak</p>
    </div>
  );
}

