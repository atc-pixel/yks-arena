"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Home as HomeIcon } from "lucide-react";

import { auth } from "@/lib/firebase/client";
import { useMatch } from "@/features/match/hooks/useMatch";
import { useQuestion } from "@/features/match/hooks/useQuestion";
import { spin, submitAnswer } from "@/features/match/services/match.api";
import type { ChoiceKey, SymbolKey } from "@/features/match/types";

import { SpinPanel } from "@/components/match/SpinPanel";
import { QuestionPanel, type MatchLastResult } from "@/components/match/QuestionPanel";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type LastResult = MatchLastResult;

export default function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const router = useRouter();

  const { match, loading } = useMatch(matchId);
  const myUid = auth.currentUser?.uid ?? null;

  const players = (match?.players ?? []) as string[];
  const oppUid = useMemo(() => {
    if (!myUid) return null;
    return players.find((u) => u !== myUid) ?? null;
  }, [players, myUid]);

  const isMyTurn = match?.turn?.currentUid === myUid;
  const phase = (match?.turn?.phase ?? "SPIN") as string;
  const activeQuestionId = (match?.turn?.activeQuestionId ?? null) as string | null;
  const challengeSymbol = (match?.turn?.challengeSymbol ?? null) as SymbolKey | null;

  const { question, loading: questionLoading } = useQuestion(activeQuestionId);

  const [busy, setBusy] = useState<"spin" | "answer" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myState = match?.stateByUid?.[myUid ?? ""] as any;
  const oppState = match?.stateByUid?.[oppUid ?? ""] as any;

  const lastResult = (match?.turn?.lastResult ?? null) as LastResult | null;

  // Redirect when match finishes
  useEffect(() => {
    if (match?.status === "FINISHED") {
      router.push(`/results/${matchId}`);
    }
  }, [match?.status, matchId, router]);

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

  const onSpin = async () => {
    setError(null);

    if (!isMyTurn) {
      setError("Sıra sende değil.");
      return;
    }
    if (phase !== "SPIN") {
      setError("Şu an spin aşamasında değilsin.");
      return;
    }

    setBusy("spin");
    try {
      const res = await spin(matchId);
      return res;
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Spin failed (functions).");
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = async (answer: ChoiceKey) => {
    setError(null);

    if (!isMyTurn) {
      setError("Sıra sende değil.");
      return;
    }
    if (phase !== "QUESTION") {
      setError("Şu an soru aşamasında değilsin.");
      return;
    }
    if (!activeQuestionId) {
      setError("activeQuestionId yok. Backend state'i kontrol et.");
      return;
    }

    setBusy("answer");
    try {
      await submitAnswer(matchId, answer);
    } catch (e: any) {
      console.error(e);
      // Friendly mapping (do not show raw codes)
      const msg = String(e?.message || "");
      if (msg.includes("ENERGY_ZERO")) {
        setError("Enerjin yok. Refill'i bekle ya da kutu aç!");
      } else {
        setError(e?.message || "Answer submit failed (functions).");
      }
      throw e;
    } finally {
      setBusy(null);
    }
  };

  const canSpin = Boolean(isMyTurn && phase === "SPIN" && busy === null);
  const canAnswer = Boolean(isMyTurn && phase === "QUESTION");

  return (
    <main className="min-h-dvh bg-linear-to-b from-neutral-950 via-neutral-950 to-neutral-900 text-neutral-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        {/* Top bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => router.push("/")}
            className={cx(
              "inline-flex items-center gap-2 rounded-2xl bg-neutral-900/60 px-3 py-2 text-sm font-semibold text-neutral-200 ring-1 ring-neutral-800",
              "transition-transform active:scale-95"
            )}
          >
            <HomeIcon className="h-4 w-4" />
            Ana Sayfa
          </button>

          <div className="flex items-center gap-2">
            <span
              className={cx(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                match.status === "ACTIVE"
                  ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                  : "bg-neutral-900 text-neutral-300 ring-neutral-800"
              )}
            >
              {match.status}
            </span>

            <span
              className={cx(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                isMyTurn
                  ? "bg-emerald-500/20 text-emerald-200 ring-emerald-500/30"
                  : "bg-neutral-900 text-neutral-300 ring-neutral-800"
              )}
            >
              {isMyTurn ? "Sıra sende" : "Rakipte"}
            </span>

            <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-neutral-300 ring-1 ring-neutral-800">
              Phase: <span className="font-semibold">{phase}</span>
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Last result (truth = Firestore state) */}
        {lastResult && (
          <div
            className={cx(
              "mb-6 rounded-2xl p-4 ring-1",
              lastResult.isCorrect
                ? "bg-emerald-500/10 ring-emerald-500/30 text-emerald-200"
                : "bg-red-500/10 ring-red-500/30 text-red-200"
            )}
          >
            <div className="text-sm font-semibold">
              {lastResult.isCorrect ? "✅ Doğru" : "❌ Yanlış"}
            </div>

            <div className="mt-2 text-sm text-neutral-200">
              Kategori: <b>{lastResult.symbol}</b> • Senin cevabın: <b>{lastResult.answer}</b> • Doğru:{" "}
              <b>{lastResult.correctAnswer}</b>
            </div>

            {lastResult.earnedSymbol && (
              <div className="mt-2 text-sm text-neutral-100">
                🏆 Kazanılan sembol: <b>{lastResult.earnedSymbol}</b>
              </div>
            )}
          </div>
        )}

        {/* Scoreboard */}
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
            <div className="text-xs text-neutral-400">Sen</div>
            <div className="mt-1 font-mono text-xs">{myUid ?? "—"}</div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
                <div className="text-xs text-neutral-400">🏆 Match Trophies</div>
                <div className="mt-1 text-2xl font-semibold">{myState?.trophies ?? 0}</div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
              <div className="text-xs text-neutral-400">Symbols</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(myState?.symbols ?? []).length ? (
                  (myState.symbols as string[]).map((s) => (
                    <span
                      key={s}
                      className="rounded-xl bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-500/30"
                    >
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-neutral-400">—</span>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
            <div className="text-xs text-neutral-400">Rakip</div>
            <div className="mt-1 font-mono text-xs">{oppUid ?? "—"}</div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
                <div className="text-xs text-neutral-400">🏆 Match Trophies</div>
                <div className="mt-1 text-2xl font-semibold">{oppState?.trophies ?? 0}</div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
              <div className="text-xs text-neutral-400">Symbols</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(oppState?.symbols ?? []).length ? (
                  (oppState.symbols as string[]).map((s) => (
                    <span
                      key={s}
                      className="rounded-xl bg-neutral-800 px-3 py-1 text-xs font-semibold text-neutral-200 ring-1 ring-neutral-700"
                    >
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-neutral-400">—</span>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Game loop panels */}
        <div className="mt-6">
          {phase === "SPIN" && (
            <SpinPanel
              canSpin={Boolean(isMyTurn)}
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
              choices={(question?.choices as any) ?? null}
              lastResult={lastResult}
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
