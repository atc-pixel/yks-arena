/**
 * Results Header Component
 * 
 * Architecture Decision:
 * - Results header ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

type Props = {
  title: string;
  subtitle: string;
};

import { motion } from "framer-motion";

export function ResultsHeader({ title, subtitle }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-8"
    >
      <motion.h1
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        className="text-5xl font-black uppercase tracking-tight text-white drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]"
      >
        {title}
      </motion.h1>
      <p className="mt-4 rounded-xl border-2 border-black bg-white/90 px-4 py-2 text-base font-bold text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        {subtitle}
      </p>
    </motion.div>
  );
}

