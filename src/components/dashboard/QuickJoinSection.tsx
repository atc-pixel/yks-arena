/**
 * Quick Join Section Component
 * 
 * Architecture Decision:
 * - Join form logic'i ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

type Props = {
  joinCode: string;
  setJoinCode: (code: string) => void;
  canJoin: boolean;
  busy: boolean;
  energy: number;
  onJoin: () => void;
};

export function QuickJoinSection({
  joinCode,
  setJoinCode,
  canJoin,
  busy,
  energy,
  onJoin,
}: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="mt-6 rounded-3xl border-4 border-black bg-linear-to-br from-purple-400 to-indigo-500 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black uppercase tracking-wide text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.8)]">
            Koda Katıl
          </h2>
          <p className="mt-2 text-sm font-bold text-black/80">
            Arkadaşının davet kodunu gir.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <motion.input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="Örn: A1B2C3"
          whileFocus={{ scale: 1.02, y: -2 }}
          className={cn(
            "w-full rounded-xl border-4 border-black bg-white px-5 py-4 text-base font-black uppercase tracking-widest text-black",
            "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
            "outline-none focus:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all",
            "placeholder:text-black/30"
          )}
        />
      </div>

      <motion.button
        onClick={onJoin}
        disabled={!canJoin || busy || energy <= 0}
        whileHover={!busy && canJoin && energy > 0 ? { scale: 1.05, y: -2 } : {}}
        whileTap={{ scale: 0.95, y: 0 }}
        className={cn(
          "mt-4 w-full rounded-xl border-4 border-black px-5 py-4 text-base font-black uppercase tracking-wide shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
          canJoin && energy > 0
            ? "bg-cyan-400 text-black hover:bg-cyan-300 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            : "bg-neutral-300 text-neutral-600",
          "disabled:cursor-not-allowed transition-all"
        )}
      >
        {busy ? "Katılınıyor..." : "Maça Katıl"}
      </motion.button>

      {energy <= 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 rounded-lg border-2 border-black bg-white/90 px-3 py-2 text-xs font-bold text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
        >
          ⚡ Enerji 0 iken cevap veremezsin.
        </motion.p>
      )}
    </motion.section>
  );
}

