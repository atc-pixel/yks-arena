"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { MatchDoc, MatchStatus } from "@/features/match/types";

export type MatchWithId = MatchDoc & { id: string };

const ACTIVE_STATUSES: MatchStatus[] = ["WAITING", "ACTIVE"];

function tsToMs(v: any): number {
  // Firestore Timestamp (client) -> toMillis
  if (v?.toMillis) return v.toMillis();
  // Firestore Timestamp-like (admin) -> seconds/nanoseconds
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
}

export function useActiveMatches(uid: string | null) {
  const [matches, setMatches] = useState<MatchWithId[]>([]);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<string | null>(null);

  const qRef = useMemo(() => {
    if (!uid) return null;

    // ✅ Index-free query: only filters, no orderBy
    return query(
      collection(db, "matches"),
      where("players", "array-contains", uid),
      where("status", "in", ACTIVE_STATUSES as any)
    );
  }, [uid]);

  useEffect(() => {
    if (!qRef) {
      setMatches([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list: MatchWithId[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as MatchDoc),
        }));

        // ✅ Client-side sort: updatedAt varsa onu, yoksa createdAt
        list.sort((a: any, b: any) => {
          const am = tsToMs(a.updatedAt) || tsToMs(a.createdAt);
          const bm = tsToMs(b.updatedAt) || tsToMs(b.createdAt);
          return bm - am;
        });

        setMatches(list);
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setMatches([]);
        setLoading(false);
        setError(e?.message || "Active matches sorgusu başarısız.");
      }
    );

    return () => unsub();
  }, [qRef]);

  return { matches, loading, error };
}
