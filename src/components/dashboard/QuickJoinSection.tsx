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
    <section className="mt-4 rounded-3xl bg-neutral-900/40 p-5 ring-1 ring-neutral-800">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Koda katıl</h2>
          <p className="mt-1 text-sm text-neutral-300">Arkadaşının davet kodunu gir.</p>
        </div>
      </div>

      <div className="mt-4">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="Örn: A1B2C3"
          className={cn(
            "w-full rounded-2xl border border-neutral-800 bg-neutral-950/50 px-4 py-3 text-sm text-neutral-100",
            "outline-none focus:border-neutral-700"
          )}
        />
      </div>

      <motion.button
        onClick={onJoin}
        disabled={!canJoin || busy || energy <= 0}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold",
          "bg-neutral-100 text-neutral-950 hover:bg-white",
          "disabled:opacity-60 disabled:cursor-not-allowed"
        )}
      >
        {busy ? "Katılınıyor..." : "Maça Katıl"}
      </motion.button>

      {energy <= 0 && (
        <p className="mt-2 text-xs text-neutral-500">Enerji 0 iken cevap veremezsin.</p>
      )}
    </section>
  );
}

