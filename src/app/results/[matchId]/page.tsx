"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useResultsPageLogic } from "@/features/match/hooks/useResultsPageLogic";
import { ResultsHeader } from "@/components/results/ResultsHeader";
import { PlayerResultCard } from "@/components/results/PlayerResultCard";

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
  const router = useRouter();

  const {
    match,
    loading,
    derived,
    title,
    subtitle,
    meSymbols,
    oppSymbols,
    meTrophies,
    oppTrophies,
  } = useResultsPageLogic(matchId);

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
              🏠 Lobby'ye dön
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-linear-to-b from-indigo-950 via-purple-950 to-pink-950 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <ResultsHeader title={title} subtitle={subtitle} />

        <div className="grid gap-6 md:grid-cols-2">
          <PlayerResultCard
            label="Sen"
            uid={derived.meUid}
            symbols={meSymbols}
            trophies={meTrophies}
          />
          <PlayerResultCard
            label="Rakip"
            uid={derived.oppUid}
            symbols={oppSymbols}
            trophies={oppTrophies}
          />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}>
            <Link
              href="/"
              className="inline-block rounded-xl border-4 border-black bg-lime-400 px-6 py-4 text-base font-black uppercase tracking-wide text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-lime-300 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            >
              🏠 Lobby'ye Dön
            </Link>
          </motion.div>

          <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push(`/match/${matchId}`)}
            className="rounded-xl border-4 border-black bg-white px-6 py-4 text-base font-black uppercase tracking-wide text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-cyan-400 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
          >
            🔄 Maça Geri Dön (Debug)
          </motion.button>
        </div>

        <details className="mt-8 rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <summary className="cursor-pointer text-sm font-black uppercase text-black">
            Debug Detayları
          </summary>
          <pre className="mt-4 overflow-auto rounded-lg border-2 border-black bg-neutral-100 p-4 text-xs font-mono text-black">
            {JSON.stringify(match, null, 2)}
          </pre>
        </details>
      </div>
    </main>
  );
}
