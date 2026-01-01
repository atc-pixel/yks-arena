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
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cx(
        "rounded-full px-3 py-1 text-xs font-semibold ring-1",
        isCorrect
          ? "bg-green-500/15 text-green-200 ring-green-500/30"
          : "bg-red-500/15 text-red-200 ring-red-500/30"
      )}
    >
      {isCorrect ? "✅ Doğru" : "❌ Yanlış"}
    </motion.span>
  );
}

