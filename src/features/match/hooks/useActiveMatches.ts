"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { MatchDoc, MatchStatus } from "@/features/match/types";

export type MatchWithId = MatchDoc & { id: string; updatedAt?: any };

const ACTIVE_STATUSES: MatchStatus[] = ["WAITING", "ACTIVE"];

export function useActiveMatches(uid: string | null) {
  const [matches, setMatches] = useState<MatchWithId[]>([]);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<string | null>(null);

  const qRef = useMemo(() => {
    if (!uid) return null;

    // Firestore: where('status','in', [...]) + orderBy requires index
    return query(
      collection(db, "matches"),
      where("players", "array-contains", uid),
      where("status", "in", ACTIVE_STATUSES as unknown as DocumentData[]),
      orderBy("updatedAt", "desc")
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
        const list: MatchWithId[] = snap.docs.map((d) => {
          const data = d.data() as MatchDoc;
          return { id: d.id, ...(data as any) };
        });
        setMatches(list);
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setMatches([]);
        setLoading(false);

        // Index hatası / query hatası için kullanıcıya net mesaj
        const msg =
          e?.message?.includes("index") || e?.code === "failed-precondition"
            ? "Active matches sorgusu için Firestore Index gerekiyor. Console → Firestore → Indexes kısmından önerilen index’i oluştur."
            : e?.message || "Active matches sorgusu başarısız.";
        setError(msg);
      }
    );

    return () => unsub();
  }, [qRef]);

  return { matches, loading, error };
}
