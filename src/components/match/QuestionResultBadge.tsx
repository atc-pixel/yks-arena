/**
 * Question Result Badge Component
 * 
 * Architecture Decision:
 * - Result badge ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import { motion } from "framer-motion";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Props = {
  isCorrect: boolean;
};

export function QuestionResultBadge({ isCorrect }: Props) {
  return (
    <motion.span
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 300 }}
      className={cx(
        "rounded-lg border-2 border-black px-4 py-1.5 text-xs font-black uppercase tracking-wide shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
        isCorrect
          ? "bg-lime-400 text-black"
          : "bg-red-400 text-black"
      )}
    >
      {isCorrect ? "✅ DOĞRU" : "❌ YANLIŞ"}
    </motion.span>
  );
}

