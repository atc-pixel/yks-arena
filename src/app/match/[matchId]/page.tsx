"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";

import { useAnonAuth } from "@/features/auth/useAnonAuth";
import { useMatch } from "@/features/match/hooks/useMatch";
import { spin, submitAnswer } from "@/features/match/services/match.api";
import type { ChoiceKey, Question, SymbolKey } from "@/features/match/types";

import { db } from "@/lib/firebase/client";
import { TurnTimer } from "@/components/game/TurnTimer";
import { QuestionCard } from "@/components/game/QuestionCard";
import { Choices } from "@/components/game/Choices";

function symbolLabel(s: SymbolKey) {
  // şimdilik 4 Türkçe sembol
  return s;
}

export default function MatchPage() {
  const router = useRouter();
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  const { ready, user } = useAnonAuth();
  const { match, loading } = useMatch(matchId);

  const [question, setQuestion] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);

  const myUid = user?.uid ?? "";

  const isMyTurn = !!match && match.turn.currentUid === myUid;
  const phase = match?.turn.phase ?? "SPIN";
  const activeQuestionId = match?.turn.activeQuestionId ?? null;

  // active question fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeQuestionId) {
        setQuestion(null);
        return;
      }
      const qRef = doc(db, "questions", activeQuestionId);
      const snap = await getDoc(qRef);
      if (!snap.exists()) return;
      if (cancelled) return;
      setQuestion({ id: snap.id, ...(snap.data() as any) });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeQuestionId]);

  if (!ready) return <div className="opacity-70">Hazırlanıyor…</div>;
  if (loading) return <div className="opacity-70">Maç yükleniyor…</div>;
  if (!match) return <div>Maç bulunamadı.</div>;

  if (match.status === "FINISHED") {
    router.replace(`/results/${matchId}`);
    return null;
  }

  const myState = match.stateByUid?.[myUid];
  const oppUid = match.players.find((p) => p !== myUid) ?? "";
  const oppState = match.stateByUid?.[oppUid];

  const deadlineMs = useMemo(() => {
    // Bu MVP’de deadline’ı UI’da “gösterim” amaçlı tutmak istersen ileride ekleriz.
    // Şimdilik TurnTimer boş kalmasın diye 80s döndürüyorum.
    return Date.now() + 80_000;
  }, [match.turn.phase, match.turn.currentUid, match.turn.activeQuestionId]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm opacity-70">
          {isMyTurn ? (
            <span className="text-emerald-400 font-semibold">Sıra sende</span>
          ) : (
            <span className="text-amber-300 font-semibold">Rakipte</span>
          )}
        </div>
        <TurnTimer deadlineMs={deadlineMs} />
      </div>

      {/* States */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-neutral-900 p-3">
          <div className="text-xs opacity-70">Sen</div>
          <div className="text-sm">❤️ {myState?.lives ?? 0} · ⭐ {myState?.points ?? 0}</div>
          <div className="mt-2 text-xs opacity-70">Semboller</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {(myState?.symbols ?? []).map((s) => (
              <span key={s} className="rounded-lg bg-neutral-800 px-2 py-1 text-xs">
                {symbolLabel(s)}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-neutral-900 p-3">
          <div className="text-xs opacity-70">Rakip</div>
          <div className="text-sm">❤️ {oppState?.lives ?? 0} · ⭐ {oppState?.points ?? 0}</div>
          <div className="mt-2 text-xs opacity-70">Semboller</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {(oppState?.symbols ?? []).map((s) => (
              <span key={s} className="rounded-lg bg-neutral-800 px-2 py-1 text-xs">
                {symbolLabel(s)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Phase UI */}
      {phase === "SPIN" ? (
        <div className="rounded-2xl bg-neutral-900 p-4 space-y-3">
          <div className="text-sm opacity-80">
            Şimdilik çark <span className="font-semibold">sadece Türkçe</span>. (Animasyon sonra)
          </div>

          <button
            className="w-full rounded-2xl bg-white px-4 py-3 text-black font-semibold disabled:opacity-60"
            disabled={!isMyTurn || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await spin(matchId);
              } finally {
                setBusy(false);
              }
            }}
          >
            Çarkı Çevir
          </button>

          {!isMyTurn && <div className="text-xs opacity-60">Rakip çarkı çeviriyor…</div>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-neutral-900 p-3 text-sm">
            Hedef sembol:{" "}
            <span className="font-semibold">
              {match.turn.challengeSymbol ? symbolLabel(match.turn.challengeSymbol) : "—"}
            </span>{" "}
            · Streak: <span className="font-semibold">{match.turn.streak}</span>/2
          </div>

          <QuestionCard text={question?.question ?? "Soru yükleniyor…"} />

          <Choices
            locked={!isMyTurn || busy || !question}
            choices={
              (question?.choices as any) ?? { A: "…", B: "…", C: "…", D: "…", E: "…" }
            }
            onPick={async (k: ChoiceKey) => {
              if (!isMyTurn || !question) return;
              setBusy(true);
              try {
                const res = await submitAnswer(matchId, k);
                if (res.status === "FINISHED") router.push(`/results/${matchId}`);
              } finally {
                setBusy(false);
              }
            }}
          />

          {!isMyTurn && <div className="text-xs opacity-60">Rakip cevaplıyor…</div>}
        </div>
      )}
    </div>
  );
}
