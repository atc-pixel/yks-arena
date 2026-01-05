"use client";

import { motion } from "framer-motion";

import { QuestionCard } from "@/components/game/QuestionCard";
import { Choices } from "@/components/game/Choices";
import { QuestionCategoryBadge } from "@/components/match/QuestionCategoryBadge";
import { QuestionResultBadge } from "@/components/match/QuestionResultBadge";
import { QuestionResultDisplay } from "@/components/match/QuestionResultDisplay";
import { useQuestionPanelLogic } from "@/components/match/hooks/useQuestionPanelLogic";
import type { MatchLastResult } from "@/components/match/hooks/useQuestionPanelLogic";
import type { ChoiceKey, SymbolKey } from "@/lib/validation/schemas";

// Re-export type for backward compatibility
export type { MatchLastResult };

/**
 * QuestionPanel Component
 * 
 * Architecture Decision:
 * - Component "dumb" kalır, sadece UI render eder
 * - Tüm logic useQuestionPanelLogic hook'unda
 * - Sound, haptic, reveal state logic hook'ta
 */
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
  onContinue,
  canContinue,
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
  onContinue?: () => Promise<void>;
  canContinue?: boolean;
}) {
  const {
    selectedKey,
    processingKey,
    reveal,
    locked,
    onPick,
    shouldShowContinueButton,
  } = useQuestionPanelLogic({
    canAnswer,
    busy,
    myUid,
    activeQuestionId,
    lastResult,
    canContinue: canContinue ?? false,
    onSubmit,
  });

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

      {/* Sadece QUESTION phase'inde ve canAnswer false ise uyarı göster */}
      {/* busy true ise (continue butonuna basıldı, geçiş yapılıyor) uyarı gösterme */}
      {!canAnswer && !canContinue && !busy && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 rounded-lg border-2 border-black bg-white/90 px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
        >
          ⚠️ Şu an hamle yapamazsın. (Sıra rakipte veya enerji yok.)
        </motion.div>
      )}

      {reveal && <QuestionResultDisplay correctKey={reveal.correctKey} />}

      {/* Devam Butonu - Q1 doğru cevaplandığında göster */}
      {onContinue && ((reveal && reveal.isCorrect && shouldShowContinueButton) || canContinue) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
          className="mt-6"
        >
          <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95, y: 0 }}
            onClick={onContinue}
            disabled={busy || !canContinue}
            className="w-full rounded-2xl border-4 border-black bg-gradient-to-r from-lime-400 via-cyan-400 to-pink-400 px-8 py-5 text-lg font-black uppercase tracking-wider text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
          >
            {busy ? "Yükleniyor..." : "➜ Devam Et"}
          </motion.button>
        </motion.div>
      )}
    </motion.section>
  );
}
