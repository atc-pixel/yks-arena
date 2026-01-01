/**
 * Player Scoreboard Component
 * 
 * Architecture Decision:
 * - Player scoreboard ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import type { PlayerState, SymbolKey } from "@/lib/validation/schemas";

type Props = {
  label: string;
  uid: string | null;
  state: PlayerState | undefined;
  isOpponent?: boolean;
};

export function PlayerScoreboard({ label, uid, state, isOpponent = false }: Props) {
  const symbols = (state?.symbols ?? []) as SymbolKey[];

  return (
    <section className="rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-1 font-mono text-xs">{uid ?? "—"}</div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <div className="rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
          <div className="text-xs text-neutral-400">🏆 Match Trophies</div>
          <div className="mt-1 text-2xl font-semibold">{state?.trophies ?? 0}</div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
        <div className="text-xs text-neutral-400">Symbols</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {symbols.length ? (
            symbols.map((s) => (
              <span
                key={s}
                className={isOpponent
                  ? "rounded-xl bg-neutral-800 px-3 py-1 text-xs font-semibold text-neutral-200 ring-1 ring-neutral-700"
                  : "rounded-xl bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-500/30"}
              >
                {s}
              </span>
            ))
          ) : (
            <span className="text-sm text-neutral-400">—</span>
          )}
        </div>
      </div>
    </section>
  );
}

