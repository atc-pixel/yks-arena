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
  chips?: string[];
};

import { motion } from "framer-motion";

export function ResultsHeader({ title, subtitle, chips = [] }: Props) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-8"
    >
      <div className="rounded-3xl border-4 border-black bg-linear-to-br from-pink-500 via-yellow-400 to-lime-400 p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
        <motion.h1
          initial={{ scale: 0.98 }}
          animate={{ scale: [0.98, 1.02, 0.99, 1.02] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
          className="text-5xl font-black uppercase tracking-tight text-black drop-shadow-[3px_3px_0px_rgba(255,255,255,0.9)]"
        >
          {title}
        </motion.h1>

        <p className="mt-3 rounded-xl border-4 border-black bg-white px-4 py-3 text-sm font-black text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          {subtitle}
        </p>

        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-full border-2 border-black bg-black px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.header>
  );
}

