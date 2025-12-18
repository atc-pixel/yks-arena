"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useMatch } from "@/features/match/hooks/useMatch";
import { auth } from "@/lib/firebase/client";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function SymbolSlots({ owned = [] as string[] }) {
  // Projede semboller TR1..TR4 ise:
  const all = ["TR1", "TR2", "TR3", "TR4"];
  return (
    <div className="flex gap-2">
      {all.map((s) => {
        const ok = owned.includes(s);
        return (
          <div
            key={s}
            className={cx(
              "grid h-10 w-10 place-items-center rounded-xl text-xs font-semibold",
              ok
                ? "bg-emerald-500 text-neutral-950"
                : "bg-neutral-900 text-neutral-400 ring-1 ring-neutral-800"
            )}
            title={s}
          >
            {s.replace("TR", "")}
          </div>
        );
      })}
    </div>
  );
}

/**
 * MatchDoc içindeki oyuncu state’leri farklı şekillerde tutulabiliyor.
 * Bu helper “varsa” çekiyor, yoksa null dönüyor. TS patlamasın diye any kullandım.
 */
function getPlayerState(match: any, uid: string | null) {
  if (!match || !uid) return null;

  // Olası şemalar (projeye göre değişebilir):
  // match.playerStates[uid]
  // match.playersByUid[uid]
  // match.state.players[uid]
  // match.playersState[uid]
  const candidates = [
    match.playerStates?.[uid],
    match.playersByUid?.[uid],
    match.state?.players?.[uid],
    match.playersState?.[uid],
    match.playersData?.[uid],
  ].filter(Boolean);

  return candidates[0] ?? null;
}

export default function ResultsPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const router = useRouter();

  const { match, loading } = useMatch(matchId);
  const myUid = auth.currentUser?.uid ?? null;

  const derived = useMemo(() => {
    if (!match) return null;

    const m: any = match;

    // ✅ Senin şemada players string[] gibi
    const players: string[] = Array.isArray(m.players) ? m.players : [];

    const meUid = myUid && players.includes(myUid) ? myUid : null;
    const oppUid = meUid ? players.find((u) => u !== meUid) ?? null : players[0] ?? null;

    const winnerUid: string | null =
      m.winnerUid ?? m.winner?.uid ?? m.result?.winnerUid ?? null;

    const iWon = !!(meUid && winnerUid && winnerUid === meUid);

    const meState = getPlayerState(m, meUid);
    const oppState = getPlayerState(m, oppUid);

    return {
      players,
      meUid,
      oppUid,
      winnerUid,
      iWon,
      meState,
      oppState,
    };
  }, [match, myUid]);

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
              Lobby’ye dön
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const title = derived.winnerUid
    ? derived.iWon
      ? "Kazandın 🏆"
      : "Kaybettin 💀"
    : "Maç bitti";

  const subtitle = derived.winnerUid
    ? derived.iWon
      ? "4 sembolü ilk sen tamamladın."
      : "Rakip 4 sembolü önce tamamladı."
    : "Winner alanı yok (debug).";

  const meSymbols: string[] = derived.meState?.symbols ?? [];
  const oppSymbols: string[] = derived.oppState?.symbols ?? [];

  const meLives = derived.meState?.lives ?? "—";
  const meScore = derived.meState?.score ?? "—";

  const oppLives = derived.oppState?.lives ?? "—";
  const oppScore = derived.oppState?.score ?? "—";

  return (
    <main className="min-h-dvh bg-linear-to-b from-neutral-950 via-neutral-950 to-neutral-900 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-neutral-300">{subtitle}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
            <div className="text-xs text-neutral-400">Sen</div>
            <div className="mt-2 text-sm text-neutral-300">
              UID: <span className="font-mono">{derived.meUid ?? "—"}</span>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
              <div className="text-sm text-neutral-300">Semboller</div>
              <SymbolSlots owned={meSymbols} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
                <div className="text-xs text-neutral-400">❤️ Lives</div>
                <div className="mt-1 text-2xl font-semibold">{meLives}</div>
              </div>
              <div className="rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
                <div className="text-xs text-neutral-400">⭐ Points</div>
                <div className="mt-1 text-2xl font-semibold">{meScore}</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
            <div className="text-xs text-neutral-400">Rakip</div>
            <div className="mt-2 text-sm text-neutral-300">
              UID: <span className="font-mono">{derived.oppUid ?? "—"}</span>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
              <div className="text-sm text-neutral-300">Semboller</div>
              <SymbolSlots owned={oppSymbols} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
                <div className="text-xs text-neutral-400">❤️ Lives</div>
                <div className="mt-1 text-2xl font-semibold">{oppLives}</div>
              </div>
              <div className="rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
                <div className="text-xs text-neutral-400">⭐ Points</div>
                <div className="mt-1 text-2xl font-semibold">{oppScore}</div>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white"
          >
            Lobby’ye dön
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
