/**
 * Last Result Card Component
 * 
 * Architecture Decision:
 * - Last result display ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import type { TurnLastResult } from "@/lib/validation/schemas";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Props = {
  lastResult: TurnLastResult;
};

import { motion } from "framer-motion";

export function LastResultCard({ lastResult }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300 }}
      className={cx(
        "mb-6 rounded-2xl border-4 border-black p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
        lastResult.isCorrect
          ? "bg-linear-to-br from-lime-400 to-green-500"
          : "bg-linear-to-br from-red-400 to-rose-500"
      )}
    >
      <div className="text-lg font-black uppercase tracking-wide text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.8)]">
        {lastResult.isCorrect ? "✅ DOĞRU!" : "❌ YANLIŞ"}
      </div>

      <div className="mt-3 rounded-lg border-2 border-black bg-white/90 px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
        Kategori: <span className="text-pink-600">{lastResult.symbol}</span> • Senin cevabın:{" "}
        <span className="text-blue-600">{lastResult.answer}</span> • Doğru:{" "}
        <span className="text-green-600">{lastResult.correctAnswer}</span>
      </div>

      {lastResult.earnedSymbol && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className="mt-3 rounded-lg border-2 border-black bg-yellow-400 px-3 py-2 text-sm font-black uppercase text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
        >
          🏆 Kazanılan sembol: <span className="text-purple-600">{lastResult.earnedSymbol}</span>
        </motion.div>
      )}
    </motion.div>
  );
}

