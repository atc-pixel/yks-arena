/**
 * Match Header Component
 * 
 * Architecture Decision:
 * - Match status ve turn info ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import { Home as HomeIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { MatchStatus } from "@/lib/validation/schemas";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Props = {
  status: MatchStatus;
  isMyTurn: boolean;
  phase: string;
  onGoHome: () => void;
};

import { motion } from "framer-motion";

export function MatchHeader({ status, isMyTurn, phase, onGoHome }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 flex flex-wrap items-center justify-between gap-3"
    >
      <motion.button
        onClick={onGoHome}
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        className={cx(
          "inline-flex items-center gap-2 rounded-xl border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-wide text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
          "transition-all hover:bg-cyan-400 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
        )}
      >
        <HomeIcon className="h-4 w-4" />
        Ana Sayfa
      </motion.button>

      <div className="flex items-center gap-3">
        <motion.span
          whileHover={{ scale: 1.1 }}
          className={cx(
            "rounded-lg border-2 border-black px-3 py-1.5 text-xs font-black uppercase shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
            status === "ACTIVE"
              ? "bg-lime-400 text-black"
              : "bg-neutral-300 text-black"
          )}
        >
          {status}
        </motion.span>

        <motion.span
          animate={isMyTurn ? { scale: [1, 1.1, 1] } : {}}
          transition={isMyTurn ? { repeat: Infinity, duration: 1.5 } : {}}
          className={cx(
            "rounded-lg border-2 border-black px-3 py-1.5 text-xs font-black uppercase shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
            isMyTurn
              ? "bg-yellow-400 text-black"
              : "bg-blue-400 text-black"
          )}
        >
          {isMyTurn ? "⚡ Sıra Sende" : "⏳ Rakipte"}
        </motion.span>

        <span className="rounded-lg border-2 border-black bg-white px-3 py-1.5 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          Phase: <span className="text-pink-500">{phase}</span>
        </span>
      </div>
    </motion.div>
  );
}
