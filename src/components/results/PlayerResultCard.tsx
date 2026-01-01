/**
 * Player Result Card Component
 * 
 * Architecture Decision:
 * - Player result card ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import type { SymbolKey } from "@/lib/validation/schemas";

function SymbolSlots({ owned = [] as string[] }) {
  const all = ["TR1", "TR2", "TR3", "TR4"];
  return (
    <div className="flex gap-2">
      {all.map((s, i) => {
        const ok = owned.includes(s);
        return (
          <motion.div
            key={s}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1, type: "spring" }}
            whileHover={{ scale: 1.1, rotate: 5 }}
            className={`grid h-12 w-12 place-items-center rounded-lg border-4 border-black text-xs font-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${
              ok
                ? "bg-lime-400 text-black"
                : "bg-neutral-300 text-black"
            }`}
            title={s}
          >
            {s.replace("TR", "")}
          </motion.div>
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
  const isMe = label === "Sen";
  
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className={[
        "rounded-2xl border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
        isMe
          ? "bg-linear-to-br from-pink-400 to-rose-500"
          : "bg-linear-to-br from-blue-400 to-cyan-500",
      ].join(" ")}
    >
      <div className="mb-3 text-xs font-black uppercase tracking-wide text-black/70">{label}</div>
      <div className="mb-4 rounded-lg border-2 border-black bg-white/90 px-3 py-2 text-sm font-mono font-bold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        UID: {uid ?? "—"}
      </div>

      <div className="mt-4 rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="mb-3 text-sm font-black uppercase tracking-wide text-black/70">Semboller</div>
        <SymbolSlots owned={symbols as string[]} />
      </div>

      <div className="mt-4 rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="mb-2 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-black" />
          <div className="text-xs font-black uppercase tracking-wide text-black/70">Match Trophies</div>
        </div>
        <div className="text-4xl font-black tabular-nums text-black drop-shadow-[2px_2px_0px_rgba(0,0,0,0.2)]">
          {trophies}
        </div>
      </div>
    </motion.section>
  );
}

