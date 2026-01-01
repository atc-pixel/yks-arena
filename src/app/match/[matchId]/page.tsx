"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { useMatchPageLogic } from "@/features/match/hooks/useMatchPageLogic";
import { MatchHeader } from "@/components/match/MatchHeader";
import { LastResultCard } from "@/components/match/LastResultCard";
import { PlayerScoreboard } from "@/components/match/PlayerScoreboard";
import { SpinPanel } from "@/components/match/SpinPanel";
import { QuestionPanel, type MatchLastResult } from "@/components/match/QuestionPanel";
import { useSound } from "@/hooks/useSound";

/**
 * Match Page Component
 * 
 * Architecture Decision:
 * - Component "dumb" kalır, sadece UI render eder
 * - Tüm logic useMatchPageLogic hook'unda
 * - UI parçaları ayrı component'lere bölündü
 */
export default function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const router = useRouter();
  const { playCorrect } = useSound();
  const playedSymbolRef = useRef<string | null>(null);

  const {
    match,
    loading,
    myUid,
    oppUid,
    isMyTurn,
    phase,
    activeQuestionId,
    challengeSymbol,
    question,
    questionLoading,
    myState,
    oppState,
    lastResult,
    busy,
    error,
    onSpin,
    onSubmit,
    onContinue,
    canSpin,
    canAnswer,
    canContinue,
  } = useMatchPageLogic(matchId);

  // Sembol kazanıldığında doğru cevap sesi çal
  useEffect(() => {
    if (!lastResult || !myUid) return;
    if (lastResult.uid !== myUid) return;
    if (!lastResult.earnedSymbol) return;

    // Aynı sembol için tekrar çalma (at timestamp ile unique key)
    const key = `${lastResult.earnedSymbol}:${lastResult.at}`;
    if (playedSymbolRef.current === key) return;
    playedSymbolRef.current = key;

    // Sembol kazanıldığında doğru cevap sesi çal
    playCorrect();
  }, [lastResult, myUid, playCorrect]);

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

  if (!match) {
    return (
      <main className="min-h-dvh bg-linear-to-b from-indigo-950 via-purple-950 to-pink-950 text-neutral-100">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="rounded-2xl border-4 border-black bg-red-400 p-6 text-center text-lg font-black text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            Match not found.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-linear-to-b from-indigo-950 via-purple-950 to-pink-950 text-neutral-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        {/* Header */}
        <MatchHeader
          status={match.status}
          isMyTurn={isMyTurn}
          phase={phase}
          onGoHome={() => router.push("/")}
        />

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

        {/* Last result */}
        {lastResult && <LastResultCard lastResult={lastResult} />}

        {/* Scoreboard */}
        <div className="grid gap-4 md:grid-cols-2">
          <PlayerScoreboard label="Sen" uid={myUid} state={myState} />
          <PlayerScoreboard label="Rakip" uid={oppUid} state={oppState} isOpponent />
        </div>

        {/* Game loop panels */}
        <div className="mt-6">
          {phase === "SPIN" && (
            <SpinPanel
              canSpin={canSpin}
              busy={busy !== null}
              lastSymbol={challengeSymbol}
              onSpin={onSpin}
            />
          )}

          {phase === "QUESTION" && (
            <QuestionPanel
              canAnswer={canAnswer}
              busy={busy !== null}
              myUid={myUid}
              activeQuestionId={activeQuestionId}
              category={challengeSymbol}
              questionText={questionLoading ? "Soru yükleniyor..." : (question?.question ?? "Soru bulunamadı.")}
              choices={question?.choices ?? null}
              lastResult={lastResult as MatchLastResult | null}
              onSubmit={onSubmit}
              onContinue={onContinue}
              canContinue={canContinue}
            />
          )}

          {phase === "RESULT" && (
            <QuestionPanel
              canAnswer={false}
              busy={busy !== null}
              myUid={myUid}
              activeQuestionId={activeQuestionId}
              category={challengeSymbol}
              questionText={questionLoading ? "Soru yükleniyor..." : (question?.question ?? "Soru bulunamadı.")}
              choices={question?.choices ?? null}
              lastResult={lastResult as MatchLastResult | null}
              onSubmit={onSubmit}
              onContinue={onContinue}
              canContinue={canContinue}
            />
          )}
        </div>

        {/* Debug */}
        <details className="mt-6 rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <summary className="cursor-pointer text-sm font-black uppercase text-black">Debug (match raw)</summary>
          <pre className="mt-3 overflow-auto rounded-lg border-2 border-black bg-neutral-100 p-3 text-xs font-mono text-black">{JSON.stringify(match, null, 2)}</pre>
        </details>
      </div>
    </main>
  );
}
