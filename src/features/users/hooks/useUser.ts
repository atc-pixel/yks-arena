"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type LeagueName = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";

export interface User {
  displayName: string;
  photoURL: string | null;

  trophies: number;
  level: number;

  league: {
    currentLeague: LeagueName;
    weeklyScore: number;
  };

  stats: {
    totalMatches: number;
    totalWins: number;
  };

  economy: {
    energy: number;
    maxEnergy: number;
    lastEnergyRefill: Timestamp;
  };

  // backend’de kullanılıyor; ensure aşamasında yoksa da UI’da 0 kabul edeceğiz
  presence?: {
    activeMatchCount: number;
  };

  createdAt: Timestamp;
}

export function useUser(uid: string | null) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<string | null>(null);

  const ref = useMemo(() => (uid ? doc(db, "users", uid) : null), [uid]);

  useEffect(() => {
    if (!ref) {
      setUser(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setUser(null);
          setLoading(false);
          return;
        }

        const data = snap.data() as any;

        // presence yoksa 0 kabul
        if (!data.presence) data.presence = { activeMatchCount: 0 };
        if (typeof data.presence.activeMatchCount !== "number") data.presence.activeMatchCount = 0;

        setUser(data as User);
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setError(e?.message || "User realtime subscription failed.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [ref]);

  return { user, loading, error };
}
