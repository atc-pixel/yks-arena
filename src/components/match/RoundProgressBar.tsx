/**
 * RoundProgressBar Component
 * 
 * Architecture Decision:
 * - 5 bölmeli progress bar (1-2-3-4-5)
 * - Ortada 3. bölüm büyük (final match win)
 * - Soldan benim kazanımlarım, sağdan rakip kazanımları
 * - Işıklı gösterim: round wins'e göre ışıklar yanar
 * - Pop-art style: bold borders, vibrant colors, hard shadows
 */

"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

type Props = {
  myRoundWins: number; // 0-3
  oppRoundWins: number; // 0-3
  currentRoundNumber: number; // 1-5
  matchStatus: "WAITING_PLAYERS" | "ROUND_ACTIVE" | "ROUND_RESULT" | "MATCH_FINISHED";
};

export function RoundProgressBar({
  myRoundWins,
  oppRoundWins,
  currentRoundNumber,
  matchStatus,
}: Props) {
  // Progress bar layout: [1] [2] [3] [4] [5]
  // Ben soldan (1, 2), ortada büyük (3), rakip sağdan (5, 4)
  // Örnek: 1-1 ve 3. round aktifse -> [ışık] [boş] [büyük bar] [boş] [ışık]

  const getBarState = (index: number): "myWin" | "oppWin" | "current" | "empty" => {
    // Index: 0=1, 1=2, 2=3, 3=4, 4=5
    // Layout: [1] [2] [3] [4] [5] -> Ben soldan (1,2), ortada (3), rakip sağdan (5,4)
    const roundNum = index + 1; // 1, 2, 3, 4, 5

    if (index === 2) {
      // Ortada 3. bölüm (final match win) - büyük bar
      if (myRoundWins >= 3) return "myWin";
      if (oppRoundWins >= 3) return "oppWin";
      if (currentRoundNumber === 3) return "current";
      return "empty";
    } else if (index < 2) {
      // Soldan (1, 2) - benim kazanımlarım
      if (myRoundWins >= roundNum) return "myWin";
      if (currentRoundNumber === roundNum) return "current";
      return "empty";
    } else {
      // Sağdan (5, 4) - rakip kazanımları (sağdan sayılarak 1, 2)
      // 5. round -> rakip 1. kazandıysa ışık yanar
      // 4. round -> rakip 2. kazandıysa ışık yanar
      const oppRoundIndex = 5 - roundNum + 1; // 5->1, 4->2
      if (oppRoundWins >= oppRoundIndex) return "oppWin";
      if (currentRoundNumber === roundNum) return "current";
      return "empty";
    }
  };

  return (
    <div className="flex items-center justify-center gap-2">
      {/* Bar 1 (Soldan - Ben) */}
      <ProgressBarSegment
        index={0}
        state={getBarState(0)}
        isLarge={false}
        isMySide={true}
      />

      {/* Bar 2 (Soldan - Ben) */}
      <ProgressBarSegment
        index={1}
        state={getBarState(1)}
        isLarge={false}
        isMySide={true}
      />

      {/* Bar 3 (Ortada - Final Match Win - Büyük) */}
      <ProgressBarSegment
        index={2}
        state={getBarState(2)}
        isLarge={true}
        isMySide={null}
      />

      {/* Bar 4 (Sağdan - Rakip) */}
      <ProgressBarSegment
        index={3}
        state={getBarState(3)}
        isLarge={false}
        isMySide={false}
      />

      {/* Bar 5 (Sağdan - Rakip) */}
      <ProgressBarSegment
        index={4}
        state={getBarState(4)}
        isLarge={false}
        isMySide={false}
      />
    </div>
  );
}

type ProgressBarSegmentProps = {
  index: number;
  state: "myWin" | "oppWin" | "current" | "empty";
  isLarge: boolean;
  isMySide: boolean | null; // true=ben, false=rakip, null=ortada
};

function ProgressBarSegment({
  index,
  state,
  isLarge,
  isMySide,
}: ProgressBarSegmentProps) {
  const getColor = (): string => {
    if (state === "myWin") {
      return "bg-cyan-400"; // Benim kazanımlarım - mavi/cyan
    } else if (state === "oppWin") {
      return "bg-orange-400"; // Rakip kazanımları - turuncu
    } else if (state === "current") {
      return "bg-yellow-400"; // Aktif round - sarı
    } else {
      return "bg-neutral-300"; // Boş - gri
    }
  };

  const isGlowing = state === "myWin" || state === "oppWin" || state === "current";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: 1,
        boxShadow: isGlowing
          ? [
              "0px_0px_20px_rgba(59,130,246,0.8)",
              "0px_0px_30px_rgba(59,130,246,0.6)",
              "0px_0px_20px_rgba(59,130,246,0.8)",
            ]
          : "4px_4px_0px_0px_rgba(0,0,0,1)",
      }}
      transition={
        isGlowing
          ? { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
          : { duration: 0.3 }
      }
      className={cn(
        "rounded-xl border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
        isLarge ? "h-16 w-20" : "h-12 w-12",
        getColor()
      )}
    >
      {/* Işık efekti için inner glow */}
      {isGlowing && (
        <motion.div
          animate={{
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.5,
            ease: "easeInOut",
          }}
          className={cn(
            "h-full w-full rounded-lg",
            state === "myWin" ? "bg-cyan-300" : state === "oppWin" ? "bg-orange-300" : "bg-yellow-300"
          )}
        />
      )}
    </motion.div>
  );
}
