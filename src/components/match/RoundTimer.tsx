/**
 * RoundTimer Component
 * 
 * Architecture Decision:
 * - Ayrı component, round süresini gösterir
 * - Progress barda ışıklı gösterim
 * - Geri sayım timer (60 saniye)
 * - Pop-art style: bold borders, vibrant colors
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

type Props = {
  roundStartAt: number | null; // serverStartAt (milliseconds)
  durationMs?: number; // Round süresi (default: 60 saniye)
  onTimeout?: () => void;
};

export function RoundTimer({ roundStartAt, durationMs = 60000, onTimeout }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!roundStartAt) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 100); // 100ms güncelle

    return () => clearInterval(interval);
  }, [roundStartAt]);

  const remainingMs = useMemo(() => {
    if (!roundStartAt) return null;
    const elapsed = now - roundStartAt;
    const remaining = Math.max(0, durationMs - elapsed);
    return remaining;
  }, [roundStartAt, now, durationMs]);

  const remainingSeconds = useMemo(() => {
    if (remainingMs === null) return null;
    return Math.ceil(remainingMs / 1000);
  }, [remainingMs]);

  const progress = useMemo(() => {
    if (remainingMs === null) return 0;
    return Math.max(0, Math.min(1, remainingMs / durationMs));
  }, [remainingMs, durationMs]);

  // Timeout callback
  useEffect(() => {
    if (remainingMs === 0 && onTimeout) {
      onTimeout();
    }
  }, [remainingMs, onTimeout]);

  if (remainingSeconds === null) {
    return (
      <div className="rounded-xl border-4 border-black bg-neutral-300 px-4 py-2 text-sm font-black uppercase tracking-wide text-neutral-600 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        Bekleniyor...
      </div>
    );
  }

  const isWarning = remainingSeconds <= 10;
  const isCritical = remainingSeconds <= 5;

  return (
    <motion.div
      animate={
        isCritical
          ? {
              scale: [1, 1.05, 1],
            }
          : {}
      }
      transition={
        isCritical
          ? {
              repeat: Infinity,
              duration: 0.5,
              ease: "easeInOut",
            }
          : {}
      }
      className={cn(
        "relative overflow-hidden rounded-xl border-4 border-black px-4 py-2 text-sm font-black uppercase tracking-wide shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
        isCritical
          ? "bg-red-400 text-black"
          : isWarning
            ? "bg-yellow-400 text-black"
            : "bg-lime-400 text-black"
      )}
    >
      {/* Progress bar (arka plan) */}
      <motion.div
        initial={{ width: "100%" }}
        animate={{ width: `${progress * 100}%` }}
        transition={{ duration: 0.1, ease: "linear" }}
        className={cn(
          "absolute inset-y-0 left-0",
          isCritical ? "bg-red-500" : isWarning ? "bg-yellow-500" : "bg-lime-500"
        )}
      />

      {/* Text (üstte, relative) */}
      <span className="relative z-10">
        {remainingSeconds}s
      </span>

      {/* Işık efekti (critical durumda) */}
      {isCritical && (
        <motion.div
          animate={{
            opacity: [0.3, 0.7, 0.3],
          }}
          transition={{
            repeat: Infinity,
            duration: 0.5,
            ease: "easeInOut",
          }}
          className="absolute inset-0 bg-red-300"
        />
      )}
    </motion.div>
  );
}
