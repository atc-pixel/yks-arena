"use client";

import { motion } from "framer-motion";
import type { ChoiceKey } from "@/features/match/types";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Result = {
  isCorrect: boolean;
  correctAnswer: ChoiceKey;
  answer: ChoiceKey;
};

export function QuestionPanel({
  isMyTurn,
  busy,
  symbol,
  questionLoading,
  questionText,
  choices,
  selected,
  onSelect,
  result,
}: {
  isMyTurn: boolean;
  busy: boolean;
  symbol: string;
  questionLoading: boolean;
  questionText: string;
  choices: Partial<Record<ChoiceKey, string>> | null;
  selected: ChoiceKey | null;
  onSelect: (k: ChoiceKey) => void;
  result: Result | null; // sadece bu soru için varsa dolu gelir
}) {
  const showResult = Boolean(result);
  const correctKey = result?.correctAnswer ?? null;
  const wrongKey = result && !result.isCorrect ? result.answer : null;

  return (
    <section className="rounded-3xl bg-neutral-900/60 p-6 ring-1 ring-neutral-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="rounded-full bg-neutral-950/50 px-3 py-1 text-xs text-neutral-200 ring-1 ring-neutral-800">
          Kategori: <b>{symbol || "—"}</b>
        </span>
        <span className="text-xs text-neutral-400">
          {questionLoading ? "Yükleniyor..." : "Seçimini yap"}
        </span>
      </div>

      <div className="rounded-2xl bg-neutral-950/40 p-4 ring-1 ring-neutral-800">
        <div className="text-base font-semibold leading-relaxed">
          {questionLoading ? "Soru yükleniyor..." : questionText || "Soru bulunamadı."}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {choices ? (
          (["A", "B", "C", "D", "E"] as const).map((k) => {
            const choiceText = choices[k] ?? "";

            const isSelected = selected === k && !showResult;
            const isCorrect = correctKey === k;
            const isWrong = wrongKey === k;

            return (
              <motion.button
                key={k}
                whileTap={{ scale: 0.985 }}
                onClick={() => onSelect(k)}
                disabled={!isMyTurn || busy || showResult}
                className={cx(
                  "rounded-2xl px-4 py-3 text-left text-sm font-semibold ring-1 transition",
                  "disabled:cursor-not-allowed disabled:opacity-70",
                  isCorrect
                    ? "bg-emerald-500/15 text-emerald-100 ring-emerald-500/30"
                    : isWrong
                      ? "bg-red-500/15 text-red-100 ring-red-500/30"
                      : isSelected
                        ? "bg-neutral-100 text-neutral-950 ring-neutral-200"
                        : "bg-neutral-950/40 text-neutral-100 ring-neutral-800 hover:bg-neutral-950/60"
                )}
              >
                <span className="mr-2 inline-block w-7 font-mono">{k})</span>
                {choiceText}
              </motion.button>
            );
          })
        ) : (
          <div className="text-sm text-neutral-300">
            {questionLoading ? "Seçenekler yükleniyor..." : "Choices alanı yok."}
          </div>
        )}
      </div>

      {!isMyTurn && (
        <div className="mt-4 text-sm text-neutral-400">
          Rakibin cevaplaması bekleniyor.
        </div>
      )}

      {result && (
        <div
          className={cx(
            "mt-4 rounded-2xl p-4 ring-1",
            result.isCorrect
              ? "bg-emerald-500/10 ring-emerald-500/30 text-emerald-200"
              : "bg-red-500/10 ring-red-500/30 text-red-200"
          )}
        >
          <div className="text-sm font-semibold">
            {result.isCorrect ? "✅ Doğru" : "❌ Yanlış"}
          </div>
          <div className="mt-2 text-sm text-neutral-200">
            Doğru cevap: <b>{result.correctAnswer}</b>
          </div>
        </div>
      )}
    </section>
  );
}
