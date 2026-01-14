/**
 * Match Page Component (Sync Duel)
 * 
 * Architecture Decision:
 * - Component "dumb" kalır, sadece UI render eder
 * - Tüm logic useSyncDuelGame hook'unda
 * - UI parçaları ayrı component'lere bölündü
 * - Debug info için raw match data gösterilir
 */

"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { useSyncDuelGame } from "@/features/match/hooks/useSyncDuelGame";
import { RoundProgressBar } from "@/components/match/RoundProgressBar";
import { RoundTimer } from "@/components/match/RoundTimer";
import { QuestionPanel, type MatchLastResult } from "@/components/match/QuestionPanel";
import { useMatchStore } from "@/stores/matchStore";
import type { SymbolKey } from "@/lib/validation/schemas";

export default function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const router = useRouter();
  const resetInvite = useMatchStore((state) => state.resetInvite);

  // Match sayfasına gelince invite state'ini temizle (anasayfaya dönerken modal açılmasın)
  useEffect(() => {
    resetInvite();
  }, [resetInvite]);

  const {
    match,
    loading,
    myUid,
    nowMs,
    oppUid,
    syncDuel,
    currentQuestion,
    currentQuestionIndex,
    matchStatus,
    myCorrectCount,
    oppCorrectCount,
    question,
    questionLoading,
    myAnswer,
    hasAnswered,
    canStartQuestion,
    canAnswer,
    busy,
    error,
    startQuestion,
    submitAnswer,
  } = useSyncDuelGame(matchId);

  if (loading) {
    return (
      <main className="min-h-dvh bg-linear-to-b from-indigo-950 via-purple-950 to-pink-950 text-neutral-100">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="rounded-2xl border-4 border-black bg-white p-6 text-center text-lg font-black text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            Loading match...
          </div>
        </div>
      </main>
    );
  }

  if (!match || match.mode !== "SYNC_DUEL") {
    return (
      <main className="min-h-dvh bg-linear-to-b from-indigo-950 via-purple-950 to-pink-950 text-neutral-100">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="rounded-2xl border-4 border-black bg-red-400 p-6 text-center text-lg font-black text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            Match not found or not a sync duel match.
          </div>
        </div>
      </main>
    );
  }

  const category: SymbolKey | null = syncDuel?.category ?? null;
  const questionStartAt = currentQuestion?.serverStartAt ?? null;

  // Question panel için lastResult
  const lastResult: MatchLastResult | null =
    currentQuestion && category && myAnswer?.choice && question?.answer
    ? {
        uid: myUid ?? "",
        questionId: currentQuestion.questionId,
        symbol: category,
        answer: myAnswer.choice,
        correctAnswer: question.answer,
        isCorrect: myAnswer.isCorrect ?? false,
        earnedSymbol: null,
        // Render purity: Date.now() çağırma. Bu değer sadece local UI/reveal için kullanılıyor.
        at: currentQuestion.serverStartAt,
      }
    : null;

  return (
    <main className="min-h-dvh bg-linear-to-b from-indigo-950 via-purple-950 to-pink-950 text-neutral-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        {/* Header with timer */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <motion.button
            onClick={() => router.push("/")}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="rounded-xl border-4 border-black bg-white px-4 py-2 text-sm font-black uppercase tracking-wide text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-neutral-100"
          >
            ← Home
          </motion.button>

          {matchStatus === "QUESTION_ACTIVE" && questionStartAt && (
            <RoundTimer roundStartAt={questionStartAt} nowProvider={nowMs} />
          )}
        </div>

        {/* Error banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-xl border-4 border-black bg-red-400 px-4 py-3 text-sm font-black uppercase text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
          >
            {error}
          </motion.div>
        )}

        {/* Progress Bar - 3 doğruya ulaşma */}
        <div className="mb-6">
          <div className="rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="text-sm font-black uppercase text-black">Sen: {myCorrectCount}/3</div>
                <div className="mt-1 h-4 w-full rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-lime-400 transition-all"
                    style={{ width: `${(myCorrectCount / 3) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-black uppercase text-black">Rakip: {oppCorrectCount}/3</div>
                <div className="mt-1 h-4 w-full rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-red-400 transition-all"
                    style={{ width: `${(oppCorrectCount / 3) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Match Status Panel */}
        {matchStatus === "WAITING_PLAYERS" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border-4 border-black bg-yellow-400 p-6 text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
          >
            <h2 className="text-xl font-black uppercase tracking-wide text-black">
              Oyuncular Bekleniyor
            </h2>
            <p className="mt-3 text-sm font-black text-black">Maç başlıyor...</p>
          </motion.div>
        )}

        {/* Question Result Panel */}
        {matchStatus === "QUESTION_RESULT" && currentQuestion && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border-4 border-black bg-linear-to-br from-purple-400 to-pink-500 p-6 text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
          >
            <h2 className="text-xl font-black uppercase tracking-wide text-black">
              Soru {currentQuestionIndex + 1} Sonucu
            </h2>
            {currentQuestion.endedReason === "CORRECT" && currentQuestion.winnerUid === myUid && (
              <p className="mt-2 text-lg font-black text-green-600">✓ İlk Sen Bildin!</p>
            )}
            {currentQuestion.endedReason === "CORRECT" &&
              currentQuestion.winnerUid !== myUid &&
              myAnswer?.isCorrect === true && (
                <p className="mt-2 text-lg font-black text-yellow-100">
                  ✓ Doğruydun ama rakip daha hızlıydı
                </p>
              )}
            {currentQuestion.endedReason === "CORRECT" &&
              currentQuestion.winnerUid !== myUid &&
              myAnswer?.isCorrect !== true && (
                <p className="mt-2 text-lg font-black text-red-600">✗ Rakip İlk Bildi</p>
              )}
            {currentQuestion.endedReason === "TWO_WRONG" && (
              <p className="mt-2 text-lg font-black text-yellow-600">= Her İkiniz de Yanlış</p>
            )}
            {currentQuestion.endedReason === "TIMEOUT" && (
              <p className="mt-2 text-lg font-black text-orange-600">⏱ Süre Doldu</p>
            )}
            <p className="mt-3 text-sm font-black text-black">Sonraki soru hazırlanıyor...</p>
          </motion.div>
        )}

        {/* Question Panel (QUESTION_ACTIVE) */}
        {matchStatus === "QUESTION_ACTIVE" && question && (
          <QuestionPanel
            canAnswer={canAnswer}
            busy={busy !== null}
            myUid={myUid}
            activeQuestionId={currentQuestion?.questionId ?? null}
            category={category}
            questionText={question.question}
            choices={question.choices}
            lastResult={lastResult}
            onSubmit={submitAnswer}
            canContinue={false}
          />
        )}
      </div>
    </main>
  );
}
