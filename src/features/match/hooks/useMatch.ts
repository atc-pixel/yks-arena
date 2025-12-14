"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { MatchDoc } from "../types";

export function useMatch(matchId: string) {
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "matches", matchId);
    const unsub = onSnapshot(ref, (snap) => {
      setMatch((snap.data() as MatchDoc) ?? null);
      setLoading(false);
    });
    return () => unsub();
  }, [matchId]);

  return { match, loading };
}
