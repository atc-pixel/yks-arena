/**
 * Results Page Logic Hook
 * 
 * Architecture Decision:
 * - Tüm results page logic'i bu hook'a taşındı
 * - Component "dumb" kalır, sadece UI render eder
 * - State management ve business logic burada
 */

import { useMemo } from "react";
import { auth } from "@/lib/firebase/client";
import { useMatch } from "@/features/match/hooks/useMatch.rq";
import type { ChoiceKey, MatchDoc, PlayerState } from "@/lib/validation/schemas";

/**
 * MatchDoc içindeki oyuncu state'lerini type-safe şekilde çeker.
 */
function getPlayerState(match: MatchDoc | null, uid: string | null): PlayerState | null {
  if (!match || !uid) return null;
  const state = match.stateByUid?.[uid];
  return state ?? null;
}

export function useResultsPageLogic(matchId: string) {
  const { match, loading } = useMatch(matchId);
  const myUid = auth.currentUser?.uid ?? null;

  const derived = useMemo(() => {
    if (!match) return null;

    // Type-safe match data extraction
    const players: string[] = Array.isArray(match.players) ? match.players : [];

    const meUid = myUid && players.includes(myUid) ? myUid : null;
    const oppUid = meUid ? players.find((u) => u !== meUid) ?? null : players[0] ?? null;

    const winnerUid: string | null = match.winnerUid ?? null;

    const iWon = !!(meUid && winnerUid && winnerUid === meUid);

    const meState = getPlayerState(match, meUid);
    const oppState = getPlayerState(match, oppUid);

    // Sync Duel recap
    const sync = match.syncDuel;
    const meScore = meUid ? (sync.correctCounts?.[meUid] ?? 0) : 0;
    const oppScore = oppUid ? (sync.correctCounts?.[oppUid] ?? 0) : 0;

    type PerPlayerQ = {
      choice: ChoiceKey | null;
      isCorrect: boolean | null;
      clientElapsedMs: number | null;
      serverReceiveAt: number | null;
    };

    const normalizeAnswer = (a: Partial<PerPlayerQ> | undefined): PerPlayerQ => ({
      choice: (a?.choice ?? null) as ChoiceKey | null,
      isCorrect: (a?.isCorrect ?? null) as boolean | null,
      clientElapsedMs: (a?.clientElapsedMs ?? null) as number | null,
      serverReceiveAt: (a?.serverReceiveAt ?? null) as number | null,
    });

    type QuestionRecap = {
      index: number; // 1-based
      questionId: string;
      serverStartAt: number;
      endedAt: number | null;
      endedReason: "CORRECT" | "TWO_WRONG" | "TIMEOUT" | null;
      winnerUid: string | null; // only for CORRECT
      me: PerPlayerQ | null;
      opp: PerPlayerQ | null;
    };

    const questions: QuestionRecap[] = (sync.questions ?? []).map((q, idx) => {
      const meA = meUid ? normalizeAnswer(q.answers?.[meUid]) : null;
      const oppA = oppUid ? normalizeAnswer(q.answers?.[oppUid]) : null;

      let qWinner: string | null = null;
      if (q.endedReason === "CORRECT") {
        // New: backend writes winnerUid deterministically
        const winner = (q as { winnerUid?: unknown } | undefined)?.winnerUid;
        if (typeof winner === "string" || winner === null) {
          qWinner = winner;
        } else {
          // Backward compatibility (old matches): best-effort fallback
          const entries = Object.entries(q.answers ?? {});
          const correct = entries.find(
            ([, ans]) => (ans as { isCorrect?: boolean | null } | undefined)?.isCorrect === true
          );
          qWinner = correct?.[0] ?? null;
        }
      }

      return {
        index: idx + 1,
        questionId: q.questionId,
        serverStartAt: q.serverStartAt,
        endedAt: q.endedAt ?? null,
        endedReason: (q.endedReason ?? null) as "CORRECT" | "TWO_WRONG" | "TIMEOUT" | null,
        winnerUid: qWinner,
        me: meA,
        opp: oppA,
      };
    });

    const firstStart = questions[0]?.serverStartAt ?? null;
    const last = questions.length ? questions[questions.length - 1] : null;
    const lastEnd = last ? (last.endedAt ?? last.serverStartAt) : null;
    const durationMs = firstStart && lastEnd ? lastEnd - firstStart : null;

    function calcStats(uid: string | null) {
      if (!uid) return { answered: 0, avgMs: null as number | null, fastestCorrectMs: null as number | null };

      const answers = (sync.questions ?? []).map((q) => q.answers?.[uid]).filter(Boolean);
      const answered = answers.filter((a) => (a as { choice?: unknown } | undefined)?.choice !== null).length;

      const times = answers
        .map((a) => (a as { clientElapsedMs?: unknown } | undefined)?.clientElapsedMs)
        .filter((n): n is number => typeof n === "number");
      const avgMs = times.length ? times.reduce((x, y) => x + y, 0) / times.length : null;

      const correctTimes = answers
        .filter((a) => (a as { isCorrect?: unknown } | undefined)?.isCorrect === true)
        .map((a) => (a as { clientElapsedMs?: unknown } | undefined)?.clientElapsedMs)
        .filter((n): n is number => typeof n === "number");
      const fastestCorrectMs = correctTimes.length ? Math.min(...correctTimes) : null;

      return { answered, avgMs, fastestCorrectMs };
    }

    const meStats = calcStats(meUid);
    const oppStats = calcStats(oppUid);

    return {
      players,
      meUid,
      oppUid,
      winnerUid,
      iWon,
      meState,
      oppState,
      category: sync.category,
      meScore,
      oppScore,
      questions,
      durationMs,
      meStats,
      oppStats,
    };
  }, [match, myUid]);

  function formatDuration(ms: number | null): string {
    if (!ms || ms <= 0) return "—";
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function msToSecText(ms: number | null): string {
    if (ms === null) return "—";
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const title = derived?.winnerUid
    ? derived.iWon
      ? "KAZANDIN"
      : "KAYBETTİN"
    : "MAÇ BİTTİ";

  const subtitle = derived
    ? `Skor ${derived.meScore}-${derived.oppScore} • ${derived.questions.length} soru • ${formatDuration(
        derived.durationMs
      )} • ${derived.category}`
    : "—";

  const chips = derived
    ? ["SYNC DUEL", `SKOR ${derived.meScore}-${derived.oppScore}`, `${derived.questions.length} SORU`, `SÜRE ${formatDuration(derived.durationMs)}`]
    : ["SYNC DUEL"];

  const meTrophies = derived?.meState?.trophies ?? 0;
  const oppTrophies = derived?.oppState?.trophies ?? 0;

  return {
    match,
    loading,
    derived,
    title,
    subtitle,
    chips,
    meTrophies,
    oppTrophies,
    meAvgTimeText: msToSecText(derived?.meStats.avgMs ?? null),
    oppAvgTimeText: msToSecText(derived?.oppStats.avgMs ?? null),
    meFastestCorrectText: msToSecText(derived?.meStats.fastestCorrectMs ?? null),
    oppFastestCorrectText: msToSecText(derived?.oppStats.fastestCorrectMs ?? null),
  };
}

