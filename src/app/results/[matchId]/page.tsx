"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useResultsPageLogic } from "@/features/match/hooks/useResultsPageLogic";
import { ResultsHeader } from "@/components/results/ResultsHeader";
import { PlayerResultCard } from "@/components/results/PlayerResultCard";
import { useMatchStore } from "@/stores/matchStore";

/**
 * Results Page Component
 * 
 * Architecture Decision:
 * - Component "dumb" kalır, sadece UI render eder
 * - Tüm logic useResultsPageLogic hook'unda
 * - UI parçaları ayrı component'lere bölündü
 */
export default function ResultsPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const resetInvite = useMatchStore((state) => state.resetInvite);

  const {
    match,
    loading,
    derived,
    title,
    subtitle,
    chips,
    meTrophies,
    oppTrophies,
    meAvgTimeText,
    oppAvgTimeText,
    meFastestCorrectText,
    oppFastestCorrectText,
  } = useResultsPageLogic(matchId);

  // Result sayfasına gelince invite state'ini temizle (modal açılmasın)
  useEffect(() => {
    resetInvite();
  }, [resetInvite]);

  if (loading) {
    return (
      <main className="min-h-dvh bg-linear-to-b from-indigo-950 via-purple-950 to-pink-950 text-neutral-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border-4 border-black bg-white p-6 text-center text-lg font-black text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            Yükleniyor...
          </div>
        </div>
      </main>
    );
  }

  if (!match || !derived) {
    return (
      <main className="min-h-dvh bg-linear-to-b from-indigo-950 via-purple-950 to-pink-950 text-neutral-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border-4 border-black bg-red-400 p-6 text-center text-lg font-black text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            Sonuçlar alınamadı (match yok).
          </div>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-block rounded-xl border-4 border-black bg-lime-400 px-5 py-3 text-base font-black uppercase text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-lime-300 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
            >
              🏠 Lobby’ye dön
            </Link>
          </div>
        </div>
      </main>
    );
  }

  function reasonBadge(reason: string | null) {
    if (reason === "CORRECT") return { text: "DOĞRU", cls: "bg-lime-400" };
    if (reason === "TWO_WRONG") return { text: "İKİSİ DE YANLIŞ", cls: "bg-yellow-400" };
    if (reason === "TIMEOUT") return { text: "SÜRE BİTTİ", cls: "bg-orange-400" };
    return { text: "—", cls: "bg-neutral-300" };
  }

  const meHighlight =
    derived.winnerUid && derived.meUid && derived.winnerUid === derived.meUid ? "WINNER" : "LOSER";
  const oppHighlight =
    derived.winnerUid && derived.oppUid && derived.winnerUid === derived.oppUid ? "WINNER" : "LOSER";

  return (
    <main className="min-h-dvh bg-linear-to-b from-indigo-950 via-purple-950 to-pink-950 text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <ResultsHeader title={title} subtitle={subtitle} chips={chips} />

        {/* Scoreboard */}
        <div className="grid gap-6 md:grid-cols-2">
          <PlayerResultCard
            label="Sen"
            uid={derived.meUid}
            trophies={meTrophies}
            correct={derived.meScore}
            answered={derived.meStats.answered}
            avgTimeText={meAvgTimeText}
            fastestCorrectText={meFastestCorrectText}
            highlight={derived.winnerUid ? meHighlight : "NONE"}
          />
          <PlayerResultCard
            label="Rakip"
            uid={derived.oppUid}
            trophies={oppTrophies}
            correct={derived.oppScore}
            answered={derived.oppStats.answered}
            avgTimeText={oppAvgTimeText}
            fastestCorrectText={oppFastestCorrectText}
            highlight={derived.winnerUid ? oppHighlight : "NONE"}
          />
        </div>

        {/* Timeline */}
        <section className="mt-8">
          <div className="mb-3 text-sm font-black uppercase tracking-wide text-white drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            Match Timeline
          </div>

          <div className="space-y-3">
            {derived.questions.map((q) => {
              const badge = reasonBadge(q.endedReason);
              const me = q.me;
              const opp = q.opp;
              const meElapsedMs = me?.clientElapsedMs;
              const oppElapsedMs = opp?.clientElapsedMs;

              const meBox =
                me?.choice === null
                  ? "bg-neutral-200"
                  : me?.isCorrect
                    ? "bg-lime-400"
                    : "bg-rose-400";

              const oppBox =
                opp?.choice === null
                  ? "bg-neutral-200"
                  : opp?.isCorrect
                    ? "bg-lime-400"
                    : "bg-rose-400";

              return (
                <motion.div
                  key={q.questionId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-2xl border-4 border-black bg-white p-4 text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-black uppercase">Soru #{q.index}</div>
                    <div
                      className={`rounded-full border-2 border-black px-3 py-1 text-xs font-black uppercase ${badge.cls} shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]`}
                    >
                      {badge.text}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border-4 border-black bg-neutral-50 p-3">
                      <div className="text-xs font-black uppercase text-black/70">Sen</div>
                      <div className="mt-2 flex items-center gap-3">
                        <div
                          className={`grid h-12 w-12 place-items-center rounded-lg border-4 border-black text-xl font-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${meBox}`}
                        >
                          {me?.choice ?? "—"}
                        </div>
                        <div className="text-xs font-black">
                          <div>Doğru: {me?.isCorrect === null ? "—" : me?.isCorrect ? "EVET" : "HAYIR"}</div>
                          <div>
                            Süre:{" "}
                            {meElapsedMs == null
                              ? "—"
                              : `${(meElapsedMs / 1000).toFixed(1)}s`}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border-4 border-black bg-neutral-50 p-3">
                      <div className="text-xs font-black uppercase text-black/70">Rakip</div>
                      <div className="mt-2 flex items-center gap-3">
                        <div
                          className={`grid h-12 w-12 place-items-center rounded-lg border-4 border-black text-xl font-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${oppBox}`}
                        >
                          {opp?.choice ?? "—"}
                        </div>
                        <div className="text-xs font-black">
                          <div>Doğru: {opp?.isCorrect === null ? "—" : opp?.isCorrect ? "EVET" : "HAYIR"}</div>
                          <div>
                            Süre:{" "}
                            {oppElapsedMs == null
                              ? "—"
                              : `${(oppElapsedMs / 1000).toFixed(1)}s`}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs font-mono font-bold text-black/70">QID: {q.questionId}</div>
                </motion.div>
              );
            })}
          </div>
        </section>

        <div className="mt-10">
          <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/"
              className="inline-block w-full rounded-2xl border-4 border-black bg-lime-400 px-6 py-5 text-center text-base font-black uppercase tracking-wide text-black shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-lime-300"
            >
              🏠 Lobby’ye Dön
            </Link>
          </motion.div>
        </div>

        {/* Debug (tek yer): Match akışını burada inceleyelim */}
        <details className="mt-8 rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <summary className="cursor-pointer text-sm font-black uppercase text-black">
            Debug (Sync Duel)
          </summary>
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border-2 border-black bg-neutral-100 p-3 text-xs font-mono text-black">
              <div>matchId: {matchId}</div>
              <div>status: {match.status}</div>
              <div>winnerUid: {match.winnerUid ?? "—"}</div>
              <div>syncDuel.matchStatus: {match.syncDuel?.matchStatus ?? "—"}</div>
              <div>currentQuestionIndex: {(match.syncDuel?.currentQuestionIndex ?? -1) + 1}</div>
            </div>
            <pre className="overflow-auto rounded-lg border-2 border-black bg-neutral-100 p-4 text-xs font-mono text-black">
              {JSON.stringify(match.syncDuel, null, 2)}
            </pre>
          </div>
        </details>
      </div>
    </main>
  );
}
