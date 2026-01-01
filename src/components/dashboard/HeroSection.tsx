/**
 * Hero Section Component
 * 
 * Architecture Decision:
 * - Main CTA ve stats ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Props = {
  activeMatchCount: number;
  energy: number;
  canPlay: boolean;
  busy: boolean;
  startMatchReason: string | null;
  onCreateInvite: () => void;
};

export function HeroSection({
  activeMatchCount,
  energy,
  canPlay,
  busy,
  startMatchReason,
  onCreateInvite,
}: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-3xl border-4 border-black bg-linear-to-br from-cyan-400 via-pink-400 to-yellow-400 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.8)]">
            YKS ARENA
          </h1>
          <p className="mt-2 text-sm font-bold text-black/80">
            1v1 trivia. Enerjini yönet, kupaları topla.
          </p>
        </div>

        <div className="rounded-xl border-2 border-black bg-white/90 px-3 py-2 text-right text-xs font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <div className="tabular-nums text-black">Maç: {activeMatchCount}</div>
          <div className="tabular-nums text-black">Enerji: {energy}</div>
        </div>
      </div>

      <motion.button
        onClick={onCreateInvite}
        disabled={!canPlay || busy}
        whileHover={canPlay ? { scale: 1.05, y: -2 } : {}}
        whileTap={{ scale: 0.95, y: 0 }}
        animate={
          canPlay
            ? {
                boxShadow: [
                  "6px_6px_0px_0px_rgba(0,0,0,1)",
                  "4px_4px_0px_0px_rgba(0,0,0,1)",
                  "6px_6px_0px_0px_rgba(0,0,0,1)",
                ],
              }
            : {}
        }
        transition={
          canPlay
            ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" }
            : undefined
        }
        className={cn(
          "mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border-4 border-black px-6 py-5 text-lg font-black uppercase tracking-wide",
          canPlay
            ? "bg-lime-400 text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:bg-lime-300"
            : "bg-neutral-300 text-neutral-600 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
          "disabled:cursor-not-allowed transition-all"
        )}
      >
        <Play className="h-6 w-6" />
        {busy ? "Hazırlanıyor..." : "Maç Ara"}
      </motion.button>

      {startMatchReason && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 rounded-xl border-2 border-black bg-white/80 px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
        >
          {startMatchReason}
        </motion.p>
      )}
    </motion.section>
  );
}

