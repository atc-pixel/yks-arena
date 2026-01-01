/**
 * Stats Grid Component
 * 
 * Architecture Decision:
 * - User stats display ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

type Props = {
  trophies: number;
  totalWins: number;
};

import { motion } from "framer-motion";
import { Trophy, Flame } from "lucide-react";

export function StatsGrid({ trophies, totalWins }: Props) {
  return (
    <section className="mt-6 grid grid-cols-2 gap-4">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        whileHover={{ scale: 1.05, y: -2 }}
        className="rounded-2xl border-4 border-black bg-linear-to-br from-yellow-300 to-orange-400 p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
      >
        <div className="mb-2 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-black" />
          <div className="text-xs font-black uppercase tracking-wide text-black/70">
            Toplam Kupa
          </div>
        </div>
        <div className="text-4xl font-black tabular-nums text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.5)]">
          {trophies}
        </div>
        <div className="mt-2 text-xs font-bold text-black/60">Lifetime</div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        whileHover={{ scale: 1.05, y: -2 }}
        className="rounded-2xl border-4 border-black bg-linear-to-br from-pink-400 to-rose-500 p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
      >
        <div className="mb-2 flex items-center gap-2">
          <Flame className="h-5 w-5 text-black" />
          <div className="text-xs font-black uppercase tracking-wide text-black/70">
            Zaferler
          </div>
        </div>
        <div className="text-4xl font-black tabular-nums text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.5)]">
          {totalWins}
        </div>
        <div className="mt-2 text-xs font-bold text-black/60">Toplam</div>
      </motion.div>
    </section>
  );
}

