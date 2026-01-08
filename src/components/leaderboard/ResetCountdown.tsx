"use client";

import { motion } from "framer-motion";

type ResetCountdownProps = {
  countdown: { days: number; hours: number; minutes: number; seconds: number };
};

/**
 * Reset Countdown Component
 * 
 * Architecture Decision:
 * - Sadece countdown gösterir, hesaplama logic'i hook'ta
 * - Component dumb kalır
 */
export function ResetCountdown({ countdown }: ResetCountdownProps) {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.2 }}
      className="rounded-3xl border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
    >
      <div className="mb-4 text-center">
        <div className="text-sm font-bold uppercase tracking-wide text-black/70">Sıfırlanmaya Kalan Süre</div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          <div className="rounded-xl border-2 border-black bg-cyan-400 p-3 text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <div className="text-xs font-bold text-black/70">Gün</div>
            <div className="mt-1 text-2xl font-black text-black">{countdown.days}</div>
          </div>
          <div className="rounded-xl border-2 border-black bg-pink-400 p-3 text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <div className="text-xs font-bold text-black/70">Saat</div>
            <div className="mt-1 text-2xl font-black text-black">{countdown.hours}</div>
          </div>
          <div className="rounded-xl border-2 border-black bg-yellow-400 p-3 text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <div className="text-xs font-bold text-black/70">Dakika</div>
            <div className="mt-1 text-2xl font-black text-black">{countdown.minutes}</div>
          </div>
          <div className="rounded-xl border-2 border-black bg-lime-400 p-3 text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <div className="text-xs font-bold text-black/70">Saniye</div>
            <div className="mt-1 text-2xl font-black text-black">{countdown.seconds}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

