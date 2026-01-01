"use client";

import { useParams, useRouter } from "next/navigation";
import { useMatchPageLogic } from "@/features/match/hooks/useMatchPageLogic";
import { MatchHeader } from "@/components/match/MatchHeader";
import { LastResultCard } from "@/components/match/LastResultCard";
import { PlayerScoreboard } from "@/components/match/PlayerScoreboard";
import { SpinPanel } from "@/components/match/SpinPanel";
import { QuestionPanel, type MatchLastResult } from "@/components/match/QuestionPanel";

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
    canSpin,
    canAnswer,
  } = useMatchPageLogic(matchId);

  if (loading) {
    return (
      <main className="min-h-dvh bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
            Loading match...
          </div>
        </div>
      </main>
    );
  }

  if (!match) {
    return (
      <main className="min-h-dvh bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">
            Match not found.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-linear-to-b from-neutral-950 via-neutral-950 to-neutral-900 text-neutral-100">
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
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
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
            />
          )}
        </div>

        {/* Debug */}
        <details className="mt-6 rounded-2xl bg-neutral-900/40 p-4 ring-1 ring-neutral-800">
          <summary className="cursor-pointer text-sm text-neutral-300">Debug (match raw)</summary>
          <pre className="mt-3 overflow-auto text-xs text-neutral-300">{JSON.stringify(match, null, 2)}</pre>
        </details>
      </div>
    </main>
  );
}
