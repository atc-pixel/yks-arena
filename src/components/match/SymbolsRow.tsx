"use client";

import type { SymbolKey } from "@/lib/validation/schemas";

const LABEL: Record<SymbolKey, string> = {
  BILIM: "Bilim",
  COGRAFYA: "Coğrafya",
  SPOR: "Spor",
  MATEMATIK: "Mat",
};

export function SymbolsRow({ symbols }: { symbols: SymbolKey[] }) {
  if (!symbols?.length) {
    return <div className="mt-2 text-xs text-neutral-500">Sembol yok</div>;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {symbols.map((s, i) => (
        <span
          key={`${s}-${i}`}
          className="rounded-full bg-neutral-950/50 px-2 py-1 text-[11px] font-semibold text-neutral-200 ring-1 ring-neutral-800"
        >
          {LABEL[s] ?? s}
        </span>
      ))}
    </div>
  );
}
