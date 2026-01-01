/**
 * Player Result Card Component
 * 
 * Architecture Decision:
 * - Player result card ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import type { SymbolKey } from "@/lib/validation/schemas";

function SymbolSlots({ owned = [] as string[] }) {
  const all = ["TR1", "TR2", "TR3", "TR4"];
  return (
    <div className="flex gap-2">
      {all.map((s) => {
        const ok = owned.includes(s);
        return (
          <div
            key={s}
            className={`grid h-10 w-10 place-items-center rounded-xl text-xs font-semibold ${
              ok
                ? "bg-emerald-500 text-neutral-950"
                : "bg-neutral-900 text-neutral-400 ring-1 ring-neutral-800"
            }`}
            title={s}
          >
            {s.replace("TR", "")}
          </div>
        );
      })}
    </div>
  );
}

type Props = {
  label: string;
  uid: string | null;
  symbols: SymbolKey[];
  trophies: number;
};

export function PlayerResultCard({ label, uid, symbols, trophies }: Props) {
  return (
    <section className="rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-2 text-sm text-neutral-300">
        UID: <span className="font-mono">{uid ?? "—"}</span>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
        <div className="text-sm text-neutral-300">Semboller</div>
        <SymbolSlots owned={symbols as string[]} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <div className="rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
          <div className="text-xs text-neutral-400">🏆 Match Trophies</div>
          <div className="mt-1 text-2xl font-semibold">{trophies}</div>
        </div>
      </div>
    </section>
  );
}

