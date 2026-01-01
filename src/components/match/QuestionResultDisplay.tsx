/**
 * Question Result Display Component
 * 
 * Architecture Decision:
 * - Result display ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import { motion } from "framer-motion";
import type { ChoiceKey } from "@/lib/validation/schemas";

type Props = {
  correctKey: ChoiceKey;
};

export function QuestionResultDisplay({ correctKey }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300 }}
      className="mt-4 rounded-xl border-4 border-black bg-linear-to-br from-cyan-400 to-blue-500 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
    >
      <div className="text-xs font-black uppercase tracking-wide text-black/70">Doğru Cevap</div>
      <div className="mt-2 text-2xl font-black text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.8)]">
        {correctKey}
      </div>
      <div className="mt-3 rounded-lg border-2 border-black bg-white/90 px-3 py-2 text-xs font-bold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        ⏭️ Sonraki hamleye geçiliyor...
      </div>
    </motion.div>
  );
}

