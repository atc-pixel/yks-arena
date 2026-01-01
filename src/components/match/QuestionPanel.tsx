"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import { QuestionCard } from "@/components/game/QuestionCard";
import { Choices } from "@/components/game/Choices";
import { useSound } from "@/hooks/useSound";
import { QuestionCategoryBadge } from "@/components/match/QuestionCategoryBadge";
import { QuestionResultBadge } from "@/components/match/QuestionResultBadge";
import { QuestionResultDisplay } from "@/components/match/QuestionResultDisplay";
import type { ChoiceKey, SymbolKey } from "@/lib/validation/schemas";

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
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border-4 border-black bg-linear-to-br from-indigo-400 via-purple-500 to-pink-500 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <QuestionCategoryBadge category={category} />

        {reveal ? (
          <QuestionResultBadge isCorrect={reveal.isCorrect} />
        ) : (
          <span className="rounded-lg border-2 border-black bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            Seçimini Yap
          </span>
        )}
      </div>

      <div className="rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <QuestionCard text={questionText || "Soru bulunamadı."} />
      </div>

      <div className="mt-5">
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
          <div className="rounded-lg border-2 border-black bg-white px-4 py-3 text-sm font-bold text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            Choices alanı yok.
          </div>
        )}
      </div>

      {!canAnswer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 rounded-lg border-2 border-black bg-white/90 px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
        >
          ⚠️ Şu an hamle yapamazsın. (Sıra rakipte veya enerji yok.)
        </motion.div>
      )}

      {reveal && <QuestionResultDisplay correctKey={reveal.correctKey} />}
    </motion.section>
  );
}
