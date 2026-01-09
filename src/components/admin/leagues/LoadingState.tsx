"use client";

import { motion } from "framer-motion";

type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = "Yükleniyor..." }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="text-6xl mb-4"
      >
        🔄
      </motion.div>
      <p className="text-white font-bold text-xl">{message}</p>
    </div>
  );
}

