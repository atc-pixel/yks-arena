"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { auth } from "@/lib/firebase/client";
import { useMatch } from "@/features/match/hooks/useMatch";
import { spin, submitAnswer } from "@/features/match/services/match.api";
import type { ChoiceKey } from "@/features/match/types";

// Senin projende bu componentler varsa kalsın; yoksa alttaki usage'ları sil.
// import TurnTimer from "@/features/match/components/TurnTimer";
// import QuestionCard from "@/features/match/components/QuestionCard";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const router = useRouter();

  // ✅ HOOKS: her zaman aynı sırada
  const { match, loading } = useMatch(matchId);

  const [busy, setBusy] = useState<"spin" | "answer" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myUid = auth.currentUser?.uid ?? null;

  // ✅ match gelmese bile hook çalışır (safe fallback)
  const players = (match?.players ?? []) as string[];
  const oppUid = useMemo(() => {
    if (!myUid) return null;
    return players.find((u) => u !== myUid) ?? null;
  }, [players, myUid]);

  const myState = match?.stateByUid?.[myUid ?? ""] as any;
  const oppState = match?.stateByUid?.[oppUid ?? ""] as any;

  // ✅ useMemo artık conditional değil, her render’da çalışır
  const deadlineMs = useMemo(() => {
    // MVP: gerçek deadline yoksa stabil bir değer dön
    // Date.now() her render’da değiştiği için hydration vs değil, ama hook order için sorun değil.
    // Yine de "stabil" olsun diye matchId bazlı pseudo bir süre üretelim.
    const base = Date.now();
    return base + 80_000;
  }, [matchId]);

  // Match bitti ise results'a yönlendirme (varsa)
  useEffect(() => {
    if (match?.status === "FINISHED") {
      router.push(`/results/${matchId}`);
    }
  }, [match?.status, matchId, router]);

  // ✅ Early returnlar HOOK'lardan sonra
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

  if (!match) {
    return (
      <main className="min-h-dvh bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">
            Match bulunamadı.
          </div>
        </div>
      </main>
    );
  }

  const isMyTurn = match.turn?.currentUid === myUid;
  const phase = match.turn?.phase; // "SPIN" | "QUESTION"
  const activeQuestionId = match.turn?.activeQuestionId;

  const onSpin = async () => {
    if (!isMyTurn) return;
    setError(null);
    setBusy("spin");
    try {
      await spin(matchId);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Spin hatası (functions).");
    } finally {
      setBusy(null);
    }
  };

  const onAnswer = async (answer: ChoiceKey) => {
    if (!isMyTurn) return;
    setError(null);
    setBusy("answer");
    try {
      await submitAnswer(matchId, answer);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Cevap gönderilemedi (functions).");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-neutral-400">Match</div>
            <div className="font-mono text-sm">{matchId}</div>
          </div>

          <div
            className={cx(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1",
              isMyTurn
                ? "bg-emerald-500/20 text-emerald-200 ring-emerald-500/30"
                : "bg-neutral-900 text-neutral-300 ring-neutral-800"
            )}
          >
            {isMyTurn ? "Sıra sende" : "Rakipte"}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-neutral-400">Phase</div>
              <div className="text-lg font-semibold">{phase}</div>
            </div>

            <div className="text-right">
              <div className="text-xs text-neutral-400">Timer (MVP)</div>
              <div className="text-sm font-mono">{deadlineMs}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
              <div className="text-xs text-neutral-400">Sen</div>
              <div className="mt-1 font-mono text-xs">{myUid ?? "—"}</div>
              <div className="mt-3 text-sm text-neutral-300">
                Lives: <span className="font-semibold">{myState?.lives ?? "—"}</span> • Points:{" "}
                <span className="font-semibold">{myState?.points ?? "—"}</span>
              </div>
            </div>

            <div className="rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
              <div className="text-xs text-neutral-400">Rakip</div>
              <div className="mt-1 font-mono text-xs">{oppUid ?? "—"}</div>
              <div className="mt-3 text-sm text-neutral-300">
                Lives: <span className="font-semibold">{oppState?.lives ?? "—"}</span> • Points:{" "}
                <span className="font-semibold">{oppState?.points ?? "—"}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={onSpin}
              disabled={!isMyTurn || busy !== null || phase !== "SPIN"}
              className={cx(
                "rounded-xl px-4 py-3 text-sm font-semibold",
                "bg-emerald-500 text-neutral-950 hover:bg-emerald-400",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
            >
              {busy === "spin" ? "Çevriliyor..." : "Çark Çevir"}
            </button>

            <button
              onClick={() => onAnswer("A")}
              disabled={!isMyTurn || busy !== null || phase !== "QUESTION" || !activeQuestionId}
              className="rounded-xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              A
            </button>
            <button
              onClick={() => onAnswer("B")}
              disabled={!isMyTurn || busy !== null || phase !== "QUESTION" || !activeQuestionId}
              className="rounded-xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              B
            </button>
            <button
              onClick={() => onAnswer("C")}
              disabled={!isMyTurn || busy !== null || phase !== "QUESTION" || !activeQuestionId}
              className="rounded-xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              C
            </button>
            <button
              onClick={() => onAnswer("D")}
              disabled={!isMyTurn || busy !== null || phase !== "QUESTION" || !activeQuestionId}
              className="rounded-xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              D
            </button>
            <button
              onClick={() => onAnswer("E")}
              disabled={!isMyTurn || busy !== null || phase !== "QUESTION" || !activeQuestionId}
              className="rounded-xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              E
            </button>
          </div>
        </section>

        <details className="mt-6 rounded-2xl bg-neutral-900/40 p-4 ring-1 ring-neutral-800">
          <summary className="cursor-pointer text-sm text-neutral-300">Debug (match raw)</summary>
          <pre className="mt-3 overflow-auto text-xs text-neutral-300">
            {JSON.stringify(match, null, 2)}
          </pre>
        </details>
      </div>
    </main>
  );
}
