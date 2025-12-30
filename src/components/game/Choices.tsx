"use client";

import { motion } from "framer-motion";
import type { ChoiceKey } from "@/features/match/types";

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
          "w-full rounded-2xl border-b-4 px-4 py-3 text-left text-sm font-semibold shadow-lg",
          "transition-transform duration-150 active:scale-95",
          "disabled:cursor-not-allowed disabled:opacity-70",
          isProcessing
            ? "bg-yellow-400 border-yellow-600 text-yellow-900"
            : isCorrect
              ? "bg-green-500 border-green-700 text-white"
              : isWrong
                ? "bg-red-500 border-red-700 text-white"
                : isSelected
                  ? "bg-neutral-100 border-neutral-300 text-neutral-950"
                  : "bg-neutral-900 border-neutral-950 text-neutral-100 hover:bg-neutral-800"
        );

        return (
          <motion.button
            key={k}
            whileTap={{ scale: 0.97 }}
            disabled={locked}
            onClick={() => onPick(k)}
            className={classes}
          >
            <span
              className={cx(
                "mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm font-semibold",
                isProcessing
                  ? "bg-yellow-300 text-yellow-900"
                  : isCorrect
                    ? "bg-green-600 text-white"
                    : isWrong
                      ? "bg-red-600 text-white"
                      : "bg-neutral-800 text-neutral-200"
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
