"use client";

import { motion } from "framer-motion";
import type { SymbolKey } from "@/lib/validation/schemas";

const LABEL: Record<SymbolKey, string> = {
  BILIM: "Bilim",
  COGRAFYA: "Coğrafya",
  SPOR: "Spor",
  MATEMATIK: "Mat",
};

export function SymbolsRow({ symbols }: { symbols: SymbolKey[] }) {
  if (!symbols?.length) {
    return (
      <div className="mt-3 rounded-lg border-2 border-black bg-white/90 px-2 py-1 text-xs font-bold text-black/60 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        Sembol yok
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {symbols.map((s, i) => (
        <motion.span
          key={`${s}-${i}`}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.1 }}
          whileHover={{ scale: 1.1, rotate: 5 }}
          className="rounded-lg border-2 border-black bg-yellow-400 px-3 py-1.5 text-xs font-black uppercase text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        >
          {LABEL[s] ?? s}
        </motion.span>
      ))}
    </div>
  );
}
