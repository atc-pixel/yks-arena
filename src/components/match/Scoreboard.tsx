"use client";

import type { SymbolKey } from "@/features/match/types";
import { SymbolsRow } from "./SymbolsRow";

export function Scoreboard({
  myTrophies,
  oppTrophies,
  mySymbols,
  oppSymbols,
}: {
  myTrophies: number;
  oppTrophies: number;
  mySymbols: SymbolKey[];
  oppSymbols: SymbolKey[];
}) {
  return (
    <div className="mb-5 grid gap-3 md:grid-cols-2">
      <div className="rounded-3xl bg-neutral-900/50 p-4 ring-1 ring-neutral-800">
        <div className="text-xs text-neutral-400">Sen</div>
        <div className="mt-1 text-lg font-semibold">{myTrophies} 🏆</div>
        <SymbolsRow symbols={mySymbols} />
      </div>

      <div className="rounded-3xl bg-neutral-900/50 p-4 ring-1 ring-neutral-800">
        <div className="text-xs text-neutral-400">Rakip</div>
        <div className="mt-1 text-lg font-semibold">{oppTrophies} 🏆</div>
        <SymbolsRow symbols={oppSymbols} />
      </div>
    </div>
  );
}
