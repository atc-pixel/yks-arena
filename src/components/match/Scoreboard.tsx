"use client";

import { motion } from "framer-motion";
import type { SymbolKey } from "@/lib/validation/schemas";
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
    <div className="mb-5 grid gap-4 md:grid-cols-2">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="rounded-2xl border-4 border-black bg-linear-to-br from-pink-400 to-rose-500 p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
      >
        <div className="text-xs font-black uppercase tracking-wide text-black/70">Sen</div>
        <div className="mt-2 text-2xl font-black text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.8)]">
          {myTrophies} 🏆
        </div>
        <SymbolsRow symbols={mySymbols} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="rounded-2xl border-4 border-black bg-linear-to-br from-blue-400 to-cyan-500 p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
      >
        <div className="text-xs font-black uppercase tracking-wide text-black/70">Rakip</div>
        <div className="mt-2 text-2xl font-black text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.8)]">
          {oppTrophies} 🏆
        </div>
        <SymbolsRow symbols={oppSymbols} />
      </motion.div>
    </div>
  );
}
