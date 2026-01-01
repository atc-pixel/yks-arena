"use client";

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
      <main className="min-h-dvh bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
            Yükleniyor...
          </div>
        </div>
      </main>
    );
  }

  if (!match || !derived) {
    return (
      <main className="min-h-dvh bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">
            Sonuçlar alınamadı (match yok).
          </div>
          <div className="mt-4">
            <Link
              href="/"
              className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950"
            >
              Lobby'ye dön
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-linear-to-b from-neutral-950 via-neutral-950 to-neutral-900 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <ResultsHeader title={title} subtitle={subtitle} />

        <div className="grid gap-4 md:grid-cols-2">
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

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white"
          >
            Lobby'ye dön
          </Link>

          <button
            onClick={() => router.push(`/match/${matchId}`)}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-200 ring-1 ring-neutral-800 hover:bg-neutral-800"
          >
            Maça geri dön (debug)
          </button>
        </div>

        <details className="mt-6 rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
          <summary className="cursor-pointer text-sm text-neutral-300">
            Debug detayları
          </summary>
          <pre className="mt-3 overflow-auto text-xs text-neutral-300">
            {JSON.stringify(match, null, 2)}
          </pre>
        </details>
      </div>
    </main>
  );
}
