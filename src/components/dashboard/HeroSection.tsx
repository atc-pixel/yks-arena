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
    <section className="rounded-3xl bg-neutral-900/40 p-5 ring-1 ring-neutral-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">YKS Arena</h1>
          <p className="mt-1 text-sm text-neutral-300">
            1v1 trivia. Enerjini yönet, kupaları topla.
          </p>
        </div>

        <div className="text-right text-xs text-neutral-400">
          <div className="tabular-nums">Maç: {activeMatchCount}</div>
          <div className="tabular-nums">Enerji: {energy}</div>
        </div>
      </div>

      <motion.button
        onClick={onCreateInvite}
        disabled={!canPlay || busy}
        whileTap={{ scale: 0.98 }}
        animate={canPlay ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        transition={canPlay ? { repeat: Infinity, duration: 1.6, ease: "easeInOut" } : undefined}
        className={cn(
          "mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-semibold",
          canPlay
            ? "bg-emerald-500 text-neutral-950 hover:bg-emerald-400"
            : "bg-neutral-800 text-neutral-400",
          "ring-1 ring-neutral-800 disabled:cursor-not-allowed"
        )}
      >
        <Play className="h-5 w-5" />
        {busy ? "Hazırlanıyor..." : "Maç Ara"}
      </motion.button>

      {startMatchReason && (
        <p className="mt-3 text-sm text-neutral-400">{startMatchReason}</p>
      )}
    </section>
  );
}

