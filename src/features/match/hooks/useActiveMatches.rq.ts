/**
 * useActiveMatches Hook (React Query Version)
 * 
 * Architecture Decision:
 * - Collection query için React Query cache kullanıyoruz
 * - Aynı uid için birden fazla component kullanırsa, tek subscription yeterli
 * - Client-side sorting yapılıyor (Firestore index gerektirmez)
 */

"use client";

import { useMemo } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { MatchDocSchema } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import { useFirestoreQueryCollection } from "@/lib/react-query/firestore-adapter";
import type { MatchDoc, MatchStatus } from "@/lib/validation/schemas";

export type MatchWithId = MatchDoc & { id: string };

const ACTIVE_STATUSES: MatchStatus[] = ["WAITING", "ACTIVE"];

function tsToMs(v: unknown): number {
  // Firestore Timestamp (client) -> toMillis
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: () => number }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  // Firestore Timestamp-like (admin) -> seconds/nanoseconds
  if (v && typeof v === "object" && "seconds" in v && typeof (v as { seconds: number }).seconds === "number") {
    return (v as { seconds: number }).seconds * 1000;
  }
  return 0;
}

export function useActiveMatches(uid: string | null) {
  const qRef = useMemo(() => {
    if (!uid) return null;

    // ✅ Index-free query: only filters, no orderBy
    return query(
      collection(db, "matches"),
      where("players", "array-contains", uid),
      where("status", "in", ACTIVE_STATUSES)
    );
  }, [uid]);

  const { data: matches, loading, error } = useFirestoreQueryCollection<MatchWithId>(
    uid ? ["activeMatches", uid] : ["activeMatches", "null"],
    (onNext) => {
      if (!qRef) {
        onNext([]);
        return () => {}; // No-op unsubscribe
      }

      const unsubscribe = onSnapshot(
        qRef,
        (snap) => {
          // Zod validation ile her match'i parse et
          const validatedMatches: MatchWithId[] = snap.docs
            .map((d) => {
              const rawData = d.data();
              const validated = safeParse(MatchDocSchema, rawData, `useActiveMatches:${d.id}`);
              if (!validated) return null; // Invalid match'leri filtrele
              return { id: d.id, ...validated };
            })
            .filter((m): m is MatchWithId => m !== null);

          // ✅ Client-side sort: updatedAt varsa onu, yoksa createdAt
          validatedMatches.sort((a, b) => {
            const am = tsToMs((b as unknown as { updatedAt?: unknown }).updatedAt) || tsToMs(a.createdAt);
            const bm = tsToMs((a as unknown as { updatedAt?: unknown }).updatedAt) || tsToMs(b.createdAt);
            return bm - am;
          });

          onNext(validatedMatches);
        },
        (e) => {
          console.error("useActiveMatches snapshot error:", e);
          onNext([]);
        }
      );

      return unsubscribe;
    }
  );

  return {
    matches: matches ?? [],
    loading,
    error: error ? new Error(error.message || "Active matches fetch failed") : null,
  };
}

