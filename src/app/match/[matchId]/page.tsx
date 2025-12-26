"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { auth } from "@/lib/firebase/client";
import { useMatch } from "@/features/match/hooks/useMatch";
import { useQuestion } from "@/features/match/hooks/useQuestion";
import { spin, submitAnswer } from "@/features/match/services/match.api";
import type { ChoiceKey } from "@/features/match/types";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type LastResult = {
  uid: string;
  questionId: string;
  symbol: string; // SymbolKey, but keep as string for UI safety
  answer: ChoiceKey;
  correctAnswer: ChoiceKey;
  isCorrect: boolean;
  earnedSymbol: string | null;
  at: number;
};

export default function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const router = useRouter();

  // --- Hooks (order must never change) ---
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

  const { question, loading: questionLoading } = useQuestion(activeQuestionId);

  const [busy, setBusy] = useState<"spin" | "answer" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myState = match?.stateByUid?.[myUid ?? ""] as any;
  const oppState = match?.stateByUid?.[oppUid ?? ""] as any;

  const lastResult = match?.turn.lastResult ?? null;


  // Redirect when match finishes
  useEffect(() => {
    if (match?.status === "FINISHED") {
      router.push(`/results/${matchId}`);
    }
  }, [match?.status, matchId, router]);

  // --- UI guards after hooks ---
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
      await spin(matchId);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Spin failed (functions).");
    } finally {
      setBusy(null);
    }
  };

  const onAnswer = async (answer: ChoiceKey) => {
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
      // No local toast hacks: UI reflects match.turn.lastResult from Firestore
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Answer submit failed (functions).");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-dvh bg-linear-to-b from-neutral-950 via-neutral-950 to-neutral-900 text-neutral-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        {/* Top bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-neutral-400">Match</div>
            <div className="font-mono text-sm">{matchId}</div>
          </div>

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

            <div className="mt-3 text-xs text-neutral-400">
              answered: {myState?.answeredCount ?? 0} • wrong: {myState?.wrongCount ?? 0}
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

            <div className="mt-3 text-xs text-neutral-400">
              answered: {oppState?.answeredCount ?? 0} • wrong: {oppState?.wrongCount ?? 0}
            </div>
          </section>
        </div>

        {/* Actions */}
        <section className="mt-6 rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-neutral-400">Turn</div>
              <div className="mt-1 text-sm text-neutral-200">
                Current UID:{" "}
                <span className="font-mono text-xs">{match.turn?.currentUid ?? "—"}</span>
              </div>
              <div className="mt-1 text-sm text-neutral-200">
                Streak: <span className="font-semibold">{match.turn?.streak ?? 0}</span>
              </div>
            </div>

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
          </div>

          {/* Question UI */}
          {phase === "QUESTION" && (
            <div className="mt-5 rounded-2xl bg-neutral-950/60 p-4 ring-1 ring-neutral-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-neutral-400">Soru</div>

                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-neutral-200 ring-1 ring-neutral-800">
                      Kategori: <b>{match.turn?.challengeSymbol ?? "—"}</b>
                    </span>
                  </div>

                  <div className="mt-3 text-base font-semibold">
                    {questionLoading
                      ? "Soru yükleniyor..."
                      : question?.question ?? "Soru bulunamadı (doc yok veya okunamadı)."}
                  </div>
                </div>

                <div className="text-right text-xs text-neutral-400">
                  <div>QuestionId</div>
                  <div className="mt-1 font-mono text-[11px] text-neutral-300">
                    {activeQuestionId ?? "—"}
                  </div>
                </div>
              </div>

              {question?.choices ? (
                <div className="mt-4 grid gap-2">
                  {(["A", "B", "C", "D", "E"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => onAnswer(k as ChoiceKey)}
                      disabled={!isMyTurn || busy !== null}
                      className={cx(
                        "rounded-xl px-4 py-3 text-left text-sm font-semibold",
                        "bg-neutral-100 text-neutral-950 hover:bg-white",
                        "disabled:opacity-60 disabled:cursor-not-allowed"
                      )}
                    >
                      <span className="mr-2 inline-block w-6 font-mono">{k})</span>
                      {question.choices[k]}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 text-sm text-neutral-300">
                  {questionLoading ? "Choices yükleniyor..." : "Choices alanı yok."}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Debug */}
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
