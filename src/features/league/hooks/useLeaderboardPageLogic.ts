/**
 * useLeaderboardPageLogic Hook
 * 
 * Architecture Decision:
 * - Tüm logic bu hook'ta, component dumb kalır
 * - League meta, bucket ve user data'yı birleştirir
 * - Reset countdown hesaplar (Pazar 23:59'a kadar)
 */

"use client";

import { useMemo, useState, useEffect } from "react";
import { useAnonAuth } from "@/features/auth/useAnonAuth";
import { useUser } from "@/features/users/hooks/useUser.rq";
import { useLeagueMeta } from "./useLeagueMeta.rq";
import { useLeagueBucket } from "./useLeagueBucket.rq";
import type { LeagueTier } from "@/lib/validation/schemas";

/**
 * Calculate time until next Sunday 23:59 (Europe/Istanbul)
 */
function getTimeUntilReset(): { days: number; hours: number; minutes: number; seconds: number } {
  const now = new Date();
  const istanbulTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  
  // Get next Sunday
  const dayOfWeek = istanbulTime.getDay(); // 0 = Sunday, 6 = Saturday
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  
  const nextSunday = new Date(istanbulTime);
  nextSunday.setDate(istanbulTime.getDate() + daysUntilSunday);
  nextSunday.setHours(23, 59, 0, 0);
  
  // If today is Sunday and before 23:59, use today
  if (dayOfWeek === 0 && istanbulTime.getHours() < 23 || (istanbulTime.getHours() === 23 && istanbulTime.getMinutes() < 59)) {
    nextSunday.setDate(istanbulTime.getDate());
  }
  
  const diff = nextSunday.getTime() - istanbulTime.getTime();
  
  if (diff <= 0) {
    // Reset time passed, calculate for next week
    nextSunday.setDate(nextSunday.getDate() + 7);
    const newDiff = nextSunday.getTime() - istanbulTime.getTime();
    return calculateTimeParts(newDiff);
  }
  
  return calculateTimeParts(diff);
}

function calculateTimeParts(ms: number) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / 1000 / 60) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  
  return { days, hours, minutes, seconds };
}

/**
 * Convert LeagueName to LeagueTier
 */
function leagueNameToTier(leagueName: string): LeagueTier {
  const map: Record<string, LeagueTier> = {
    Teneke: "Teneke",
    BRONZE: "Bronze",
    SILVER: "Silver",
    GOLD: "Gold",
    PLATINUM: "Platinum",
    DIAMOND: "Diamond",
  };
  return map[leagueName] || "Teneke";
}

export function useLeaderboardPageLogic() {
  // Auth
  const { user: authUser, ready } = useAnonAuth();
  const uid = authUser?.uid ?? null;

  // User data
  const { user, loading: userLoading, error: userError } = useUser(uid);
  
  // League meta
  const { leagueMeta, loading: metaLoading, error: metaError } = useLeagueMeta();
  
  // User's bucket (if in a bucket league)
  const bucketId = user?.league?.currentBucketId ?? null;
  const { bucket, loading: bucketLoading, error: bucketError } = useLeagueBucket(bucketId);

  // Computed values
  const currentLeague = user?.league?.currentLeague ?? "Teneke";
  const weeklyTrophies = user?.league?.weeklyTrophies ?? 0;
  const isInTeneke = currentLeague === "Teneke";
  
  // User's rank in bucket (if in bucket)
  const userRank = useMemo(() => {
    if (!bucket || !uid) return null;
    
    // Sort players by weeklyTrophies (descending)
    const sortedPlayers = [...bucket.players].sort((a, b) => b.weeklyTrophies - a.weeklyTrophies);
    const rank = sortedPlayers.findIndex((p) => p.uid === uid) + 1;
    return rank > 0 ? rank : null;
  }, [bucket, uid]);

  // Reset countdown (real-time updates)
  const [resetCountdown, setResetCountdown] = useState(() => getTimeUntilReset());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setResetCountdown(getTimeUntilReset());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // League tier
  const leagueTier = useMemo(() => leagueNameToTier(currentLeague), [currentLeague]);

  // Promotion/Demotion info
  const promotionInfo = useMemo(() => {
    if (isInTeneke || !bucket || !userRank) return null;
    
    // Top 5 qualify for promotion
    const qualifiesForPromotion = userRank <= 5;
    // Bottom 5 demote (except Bronze)
    const willDemote = bucket.players.length === 30 && userRank > 25 && leagueTier !== "Bronze";
    // 0 trophies = Teneke
    const willGoToTeneke = weeklyTrophies === 0;
    
    return {
      qualifiesForPromotion,
      willDemote,
      willGoToTeneke,
    };
  }, [isInTeneke, bucket, userRank, leagueTier, weeklyTrophies]);

  // Loading states
  const loading = userLoading || metaLoading || (bucketId ? bucketLoading : false);
  const error = userError || metaError || bucketError;

  return {
    // Data
    user,
    leagueMeta,
    bucket,
    currentLeague,
    weeklyTrophies,
    isInTeneke,
    userRank,
    leagueTier,
    resetCountdown,
    promotionInfo,
    uid,
    
    // States
    loading,
    error,
    ready,
  };
}

