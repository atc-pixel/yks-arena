"use client";

import { motion } from "framer-motion";
import { Trophy } from "lucide-react";

/**
 * Leaderboard Header Component
 * 
 * Architecture Decision:
 * - Sadece UI render eder, logic yok
 * - Header'ı ayrı component'e ayırdık modülerlik için
 */
export function LeaderboardHeader() {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="rounded-3xl border-4 border-black bg-linear-to-br from-cyan-400 via-pink-400 to-yellow-400 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
    >
      <div className="flex items-center gap-3">
        <Trophy className="h-8 w-8 text-black" />
        <h1 className="text-2xl font-black uppercase tracking-wide text-black">Liderlik Tablosu</h1>
      </div>
    </motion.div>
  );
}

