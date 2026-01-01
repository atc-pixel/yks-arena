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
import { useMatch } from "@/features/match/hooks/useMatch";
import type { MatchDoc, PlayerState, SymbolKey } from "@/lib/validation/schemas";

/**
 * MatchDoc içindeki oyuncu state'lerini type-safe şekilde çeker.
 */
function getPlayerState(match: MatchDoc | null, uid: string | null): PlayerState | null {
  if (!match || !uid) return null;
  const state = match.stateByUid?.[uid];
  if (state) return state;
  return null;
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

  const title = derived?.winnerUid
    ? derived.iWon
      ? "Kazandın 🏆"
      : "Kaybettin 💀"
    : "Maç bitti";

  const subtitle = derived?.winnerUid
    ? derived.iWon
      ? "4 sembolü ilk sen tamamladın."
      : "Rakip 4 sembolü önce tamamladı."
    : "Winner alanı yok (debug).";

  // Type-safe symbol extraction (PlayerState.symbols is already SymbolKey[])
  const meSymbols: SymbolKey[] = (derived?.meState?.symbols ?? []) as SymbolKey[];
  const oppSymbols: SymbolKey[] = (derived?.oppState?.symbols ?? []) as SymbolKey[];

  const meTrophies = derived?.meState?.trophies ?? 0;
  const oppTrophies = derived?.oppState?.trophies ?? 0;

  return {
    match,
    loading,
    derived,
    title,
    subtitle,
    meSymbols,
    oppSymbols,
    meTrophies,
    oppTrophies,
  };
}

