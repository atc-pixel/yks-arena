"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import { QuestionCard } from "@/components/game/QuestionCard";
import { Choices } from "@/components/game/Choices";
import { useSound } from "@/hooks/useSound";
import type { ChoiceKey, SymbolKey } from "@/features/match/types";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const SYMBOL_LABEL: Partial<Record<SymbolKey, string>> = {
  MATEMATIK: "Matematik",
  COGRAFYA: "Coğrafya",
  SPOR: "Spor",
  BILIM: "Bilim",
};

export type MatchLastResult = {
  uid: string;
  questionId: string;
  symbol: string;
  answer: ChoiceKey;
  correctAnswer: ChoiceKey;
  isCorrect: boolean;
  earnedSymbol: string | null;
  at: number;
};

export function QuestionPanel({
  canAnswer,
  busy,
  myUid,
  activeQuestionId,
  category,
  questionText,
  choices,
  lastResult,
  onSubmit,
}: {
  canAnswer: boolean;
  busy: boolean;
  myUid: string | null;
  activeQuestionId: string | null;
  category: SymbolKey | null;
  questionText: string;
  choices: Record<ChoiceKey, string> | null;
  lastResult: MatchLastResult | null;
  onSubmit: (answer: ChoiceKey) => Promise<void>;
}) {
  const { playClick, playCorrect, playWrong } = useSound();

  const [selectedKey, setSelectedKey] = useState<ChoiceKey | null>(null);
  const [processingKey, setProcessingKey] = useState<ChoiceKey | null>(null);
  const [reveal, setReveal] = useState<null | {
    correctKey: ChoiceKey;
    wrongKey: ChoiceKey | null;
    isCorrect: boolean;
  }>(null);

  // prevent double submissions (even if parent busy lags)
  const submittingRef = useRef(false);
  const playedResultRef = useRef<string | null>(null);

  // reset local UI when question changes
  useEffect(() => {
    setSelectedKey(null);
    setProcessingKey(null);
    setReveal(null);
    submittingRef.current = false;
    playedResultRef.current = null;
  }, [activeQuestionId]);

  const resultForThisQuestion = useMemo(() => {
    if (!lastResult || !myUid || !activeQuestionId) return null;
    if (lastResult.uid !== myUid) return null;
    if (lastResult.questionId !== activeQuestionId) return null;
    return lastResult;
  }, [lastResult, myUid, activeQuestionId]);

  // When Firestore result arrives, reveal colors + sound + haptic
  useEffect(() => {
    if (!resultForThisQuestion) return;

    const key = `${resultForThisQuestion.questionId}:${resultForThisQuestion.at}`;
    if (playedResultRef.current === key) return;
    playedResultRef.current = key;

    setProcessingKey(null);
    setReveal({
      correctKey: resultForThisQuestion.correctAnswer,
      wrongKey: resultForThisQuestion.isCorrect ? null : resultForThisQuestion.answer,
      isCorrect: resultForThisQuestion.isCorrect,
    });

    // sounds + haptics
    if (resultForThisQuestion.isCorrect) {
      playCorrect();
      try {
        navigator.vibrate?.(200);
      } catch {
        // ignore
      }
    } else {
      playWrong();
      try {
        navigator.vibrate?.([100, 50, 100]);
      } catch {
        // ignore
      }
    }

    // keep buttons locked for a beat to let the animation land
    const t = setTimeout(() => {
      // Parent will move phase forward; we just release local submit lock
      submittingRef.current = false;
    }, 1500);

    return () => clearTimeout(t);
  }, [resultForThisQuestion, playCorrect, playWrong]);

  const locked = !canAnswer || busy || !!processingKey || !!reveal || submittingRef.current;

  const onPick = async (k: ChoiceKey) => {
    if (locked) return;
    if (!activeQuestionId) return;

    playClick();
    setSelectedKey(k);
    setProcessingKey(k);
    submittingRef.current = true;

    try {
      await onSubmit(k);
      // Firestore lastResult will drive the reveal state.
      // keep processingKey until result arrives or parent changes phase.
    } catch {
      // If submit fails, unlock and remove processing state
      submittingRef.current = false;
      setProcessingKey(null);
    }
  };

  return (
    <section className="rounded-3xl bg-neutral-900/60 p-6 ring-1 ring-neutral-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="rounded-full bg-neutral-950/50 px-3 py-1 text-xs text-neutral-200 ring-1 ring-neutral-800">
          Kategori: <b>{category ? (SYMBOL_LABEL[category] ?? category) : "—"}</b>
        </span>

        {reveal ? (
          <motion.span
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cx(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1",
              reveal.isCorrect
                ? "bg-green-500/15 text-green-200 ring-green-500/30"
                : "bg-red-500/15 text-red-200 ring-red-500/30"
            )}
          >
            {reveal.isCorrect ? "✅ Doğru" : "❌ Yanlış"}
          </motion.span>
        ) : (
          <span className="text-xs text-neutral-400">Seçimini yap</span>
        )}
      </div>

      <div className="rounded-2xl bg-neutral-950/40 p-4 ring-1 ring-neutral-800">
        <QuestionCard text={questionText || "Soru bulunamadı."} />
      </div>

      <div className="mt-4">
        {choices ? (
          <Choices
            choices={choices}
            locked={locked}
            onPick={onPick}
            state={{
              selectedKey,
              processingKey,
              correctKey: reveal?.correctKey ?? null,
              wrongKey: reveal?.wrongKey ?? null,
            }}
          />
        ) : (
          <div className="text-sm text-neutral-300">Choices alanı yok.</div>
        )}
      </div>

      {!canAnswer && (
        <div className="mt-4 text-sm text-neutral-400">
          Şu an hamle yapamazsın. (Sıra rakipte veya enerji yok.)
        </div>
      )}

      {reveal && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-2xl bg-neutral-950/50 p-4 ring-1 ring-neutral-800"
        >
          <div className="text-xs text-neutral-400">Doğru cevap</div>
          <div className="mt-1 text-sm font-semibold text-neutral-100">
            {reveal.correctKey}
          </div>
          <div className="mt-2 text-xs text-neutral-500">Sonraki hamleye geçiliyor...</div>
        </motion.div>
      )}
    </section>
  );
}
