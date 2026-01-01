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

import { motion } from "framer-motion";
import { Trophy } from "lucide-react";

export function PlayerScoreboard({ label, uid, state, isOpponent = false }: Props) {
  const symbols = (state?.symbols ?? []) as SymbolKey[];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={[
        "rounded-2xl border-4 border-black p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
        isOpponent
          ? "bg-linear-to-br from-blue-400 to-cyan-500"
          : "bg-linear-to-br from-pink-400 to-rose-500",
      ].join(" ")}
    >
      <div className="mb-2 text-xs font-black uppercase tracking-wide text-black/70">{label}</div>
      <div className="mb-4 rounded-lg border-2 border-black bg-white/90 px-2 py-1 font-mono text-xs font-bold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        {uid ?? "—"}
      </div>

      <div className="mt-4 rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="mb-2 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-black" />
          <div className="text-xs font-black uppercase tracking-wide text-black/70">Match Trophies</div>
        </div>
        <div className="text-4xl font-black tabular-nums text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.5)]">
          {state?.trophies ?? 0}
        </div>
      </div>

      <div className="mt-4 rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="mb-3 text-xs font-black uppercase tracking-wide text-black/70">Symbols</div>
        <div className="flex flex-wrap gap-2">
          {symbols.length ? (
            symbols.map((s, i) => (
              <motion.span
                key={s}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ scale: 1.1, rotate: 5 }}
                className={[
                  "rounded-lg border-2 border-black px-3 py-1.5 text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
                  isOpponent
                    ? "bg-blue-400 text-black"
                    : "bg-yellow-400 text-black",
                ].join(" ")}
              >
                {s}
              </motion.span>
            ))
          ) : (
            <span className="text-sm font-bold text-black/60">—</span>
          )}
        </div>
      </div>
    </motion.section>
  );
}

