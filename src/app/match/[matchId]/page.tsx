"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { auth } from "@/lib/firebase/client";
import { useMatch } from "@/features/match/hooks/useMatch";
import { useQuestion } from "@/features/match/hooks/useQuestion";
import { spin, submitAnswer } from "@/features/match/services/match.api";
import type { ChoiceKey } from "@/features/match/types";

import { MatchHeader } from "@/components/match/MatchHeader";
import { Scoreboard } from "@/components/match/Scoreboard";
import { SpinPanel } from "@/components/match/SpinPanel";
import { QuestionPanel } from "@/components/match/QuestionPanel";
import { EndPanel } from "@/components/match/EndPanel";

type LastResult = {
  uid: string;
  questionId: string;
  isCorrect: boolean;
  correctAnswer: ChoiceKey;
  answer: ChoiceKey;
};

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

  const { question, loading: questionLoading } = useQuestion(activeQuestionId);

  const [busy, setBusy] = useState<"spin" | "answer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ChoiceKey | null>(null);

  const myState = match?.stateByUid?.[myUid ?? ""] as any;
  const oppState = match?.stateByUid?.[oppUid ?? ""] as any;

  const lastResult = (match?.turn?.lastResult ?? null) as LastResult | null;

  // question değişince seçimi sıfırla
  useEffect(() => {
    setSelected(null);
  }, [activeQuestionId]);

  const isFinished = match?.status === "FINISHED" || phase === "END";

  // ✅ Narrow: Bu soru için result var mı? (TS patlamaz)
  const resultForThisQuestion =
    lastResult &&
    myUid &&
    activeQuestionId &&
    lastResult.uid === myUid &&
    lastResult.questionId === activeQuestionId
      ? lastResult
      : null;

  const onSpin = async () => {
    setError(null);
    if (!isMyTurn) return setError("Sıra sende değil.");
    if (phase !== "SPIN") return setError("Şu an spin aşamasında değilsin.");

    setBusy("spin");
    try {
      await spin(matchId);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Spin failed.");
    } finally {
      setBusy(null);
    }
  };

  const onAnswer = async (answer: ChoiceKey) => {
    setError(null);
    if (!isMyTurn) return setError("Sıra sende değil.");
    if (phase !== "QUESTION") return setError("Şu an soru aşamasında değilsin.");
    if (!activeQuestionId) return setError("activeQuestionId yok.");

    setSelected(answer);
    setBusy("answer");
    try {
      await submitAnswer(matchId, answer);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Answer submit failed.");
    } finally {
      setBusy(null);
    }
  };

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
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <MatchHeader status={match.status} isMyTurn={Boolean(isMyTurn)} onHome={() => router.push("/")} />

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {isFinished ? (
          <EndPanel
            winnerUid={match.winnerUid}
            myUid={myUid}
            myTrophies={Number(myState?.trophies ?? 0)}
            oppTrophies={Number(oppState?.trophies ?? 0)}
            onReturn={() => router.push("/")}
          />
        ) : (
          <>
            <Scoreboard
              myTrophies={Number(myState?.trophies ?? 0)}
              oppTrophies={Number(oppState?.trophies ?? 0)}
            />

            {phase === "SPIN" && (
              <SpinPanel
                isMyTurn={Boolean(isMyTurn)}
                busy={busy === "spin"}
                onSpin={onSpin}
              />
            )}

            {phase === "QUESTION" && (
              <QuestionPanel
                isMyTurn={Boolean(isMyTurn)}
                busy={busy === "answer"}
                symbol={String(match.turn?.challengeSymbol ?? "—")}
                questionLoading={Boolean(questionLoading)}
                questionText={String(question?.question ?? "")}
                choices={(question?.choices ?? null) as any}
                selected={selected}
                onSelect={onAnswer}
                result={
                  resultForThisQuestion
                    ? {
                        isCorrect: resultForThisQuestion.isCorrect,
                        correctAnswer: resultForThisQuestion.correctAnswer,
                        answer: resultForThisQuestion.answer,
                      }
                    : null
                }
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
