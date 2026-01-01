"use client";

import { motion } from "framer-motion";

export function QuestionCard({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border-4 border-black bg-white p-5 text-base font-bold leading-relaxed text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
    >
      {text}
    </motion.div>
  );
}
