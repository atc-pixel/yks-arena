"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { MatchDocSchema } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import type { MatchDoc } from "@/lib/validation/schemas";

/**
 * Real-time match subscription hook with Zod validation
 * 
 * Architecture Decision:
 * - Firestore'dan gelen data'yı Zod ile validate ediyoruz
 * - Invalid data gelirse null döner (app crash olmaz)
 * - Type-safe MatchDoc döner
 */
export function useMatch(matchId: string) {
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "matches", matchId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setMatch(null);
        setLoading(false);
        return;
      }

      // Zod validation ile safe parse
      const rawData = snap.data();
      const validated = safeParse(MatchDocSchema, rawData, `useMatch:${matchId}`);
      setMatch(validated);
      setLoading(false);
    });
    return () => unsub();
  }, [matchId]);

  return { match, loading };
}
