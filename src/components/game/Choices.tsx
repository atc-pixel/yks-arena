"use client";

import type { ChoiceKey } from "@/features/match/types";

export function Choices({
  choices,
  locked,
  onPick,
}: {
  choices: Record<ChoiceKey, string>;
  locked: boolean;
  onPick: (k: ChoiceKey) => void;
}) {
  const keys: ChoiceKey[] = ["A", "B", "C", "D", "E"];
  return (
    <div className="grid gap-2">
      {keys.map((k) => (
        <button
          key={k}
          disabled={locked}
          onClick={() => onPick(k)}
          className="rounded-2xl bg-neutral-900 px-4 py-3 text-left disabled:opacity-60"
        >
          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-800 text-sm font-semibold">
            {k}
          </span>
          {choices[k]}
        </button>
      ))}
    </div>
  );
}
