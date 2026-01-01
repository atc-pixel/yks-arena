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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-2xl bg-neutral-950/50 p-4 ring-1 ring-neutral-800"
    >
      <div className="text-xs text-neutral-400">Doğru cevap</div>
      <div className="mt-1 text-sm font-semibold text-neutral-100">{correctKey}</div>
      <div className="mt-2 text-xs text-neutral-500">Sonraki hamleye geçiliyor...</div>
    </motion.div>
  );
}

