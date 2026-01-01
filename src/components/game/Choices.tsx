"use client";

import { motion } from "framer-motion";
import type { ChoiceKey } from "@/lib/validation/schemas";

type ChoiceState = {
  /** User's last tapped option */
  selectedKey?: ChoiceKey | null;
  /** Option currently being sent to backend (yellow) */
  processingKey?: ChoiceKey | null;
  /** Correct answer to highlight (green) */
  correctKey?: ChoiceKey | null;
  /** Wrong picked answer (red) */
  wrongKey?: ChoiceKey | null;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/**
 * Juicy multiple-choice buttons.
 *
 * Color rules:
 * - processingKey => yellow
 * - correctKey => green
 * - wrongKey => red
 * - selectedKey (no processing/result yet) => subtle highlight
 */
export function Choices({
  choices,
  locked,
  onPick,
  state,
}: {
  choices: Record<ChoiceKey, string>;
  locked: boolean;
  onPick: (k: ChoiceKey) => void;
  state?: ChoiceState;
}) {
  const keys: ChoiceKey[] = ["A", "B", "C", "D", "E"];
  const selectedKey = state?.selectedKey ?? null;
  const processingKey = state?.processingKey ?? null;
  const correctKey = state?.correctKey ?? null;
  const wrongKey = state?.wrongKey ?? null;

  return (
    <div className="grid gap-2">
      {keys.map((k) => {
        const isProcessing = processingKey === k;
        const isCorrect = correctKey === k;
        const isWrong = wrongKey === k;
        const isSelected = selectedKey === k && !isProcessing && !isCorrect && !isWrong;

        const classes = cx(
          "w-full rounded-xl border-4 border-black px-5 py-4 text-left text-base font-black uppercase tracking-wide shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
          "transition-all duration-300 ease-out",
          "disabled:cursor-not-allowed",
          isProcessing
            ? "bg-yellow-400 text-black hover:bg-yellow-300 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
            : isCorrect
              ? "bg-lime-400 text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
              : isWrong
                ? "bg-red-400 text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                : isSelected
                  ? "bg-cyan-400 text-black hover:bg-cyan-300 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                  : "bg-white text-black hover:bg-pink-400 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
        );

        return (
          <motion.button
            key={k}
            initial={false}
            animate={{
              scale: isCorrect || isWrong ? [1, 1.02, 1] : 1,
            }}
            transition={{
              duration: 0.3,
              times: isCorrect || isWrong ? [0, 0.5, 1] : undefined,
            }}
            whileHover={!locked ? { scale: 1.02, y: -2 } : {}}
            whileTap={{ scale: 0.95, y: 0 }}
            disabled={locked}
            onClick={() => onPick(k)}
            className={classes}
          >
            <span
              className={cx(
                "mr-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border-2 border-black text-sm font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
                isProcessing
                  ? "bg-yellow-300 text-black"
                  : isCorrect
                    ? "bg-green-500 text-black"
                    : isWrong
                      ? "bg-red-500 text-black"
                      : "bg-black text-white"
              )}
            >
              {k}
            </span>
            {choices[k]}
          </motion.button>
        );
      })}
    </div>
  );
}
