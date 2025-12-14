"use client";

import { useParams } from "next/navigation";
import { useMatch } from "@/features/match/hooks/useMatch";

export default function ResultsPage() {
  const params = useParams<{ matchId: string }>();
  const { match, loading } = useMatch(params.matchId);

  if (loading) return <div className="opacity-70">Yükleniyor…</div>;
  if (!match) return <div>Maç yok.</div>;

  return (
    <div className="space-y-3">
      <div className="text-xl font-semibold">Sonuç</div>
      <div className="rounded-2xl bg-neutral-900 p-4">
        <div className="text-sm opacity-70">Status</div>
        <div className="font-semibold">{match.status}</div>
      </div>
      <div className="rounded-2xl bg-neutral-900 p-4">
        <div className="text-sm opacity-70">Skor</div>
        <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(match.stateByUid ?? {}, null, 2)}</pre>
      </div>
      <div className="rounded-2xl bg-neutral-900 p-4">
        <div className="text-sm opacity-70">Winner</div>
        <div className="font-semibold">{match.winnerUid ?? "-"}</div>
        <div className="mt-2 text-xs opacity-60">{match.endedReason ?? ""}</div>
      </div>

    </div>
    
  );
}
