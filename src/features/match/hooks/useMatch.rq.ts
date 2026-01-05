/**
 * useMatch Hook (React Query Version)
 * 
 * Architecture Decision:
 * - Firestore real-time subscription'ı React Query cache ile entegre ediyoruz
 * - Aynı matchId için birden fazla component kullanırsa, tek subscription yeterli
 * - Cache sayesinde duplicate subscriptions önlenir
 */

"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { MatchDocSchema } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import { useFirestoreQuery } from "@/lib/react-query/firestore-adapter";
import type { MatchDoc } from "@/lib/validation/schemas";

export function useMatch(matchId: string) {
  const { data, loading, error } = useFirestoreQuery<MatchDoc>(
    ["match", matchId],
    (onNext) => {
      const ref = doc(db, "matches", matchId);
      
      const unsubscribe = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            onNext(null);
            return;
          }

          const rawData = snap.data();
          const validated = safeParse(MatchDocSchema, rawData, `useMatch:${matchId}`);
          onNext(validated);
        },
        (err) => {
          console.error("useMatch snapshot error:", err);
          onNext(null);
        }
      );

      return unsubscribe;
    }
  );

  // Backward compatibility: return match instead of data
  return { match: data, loading, error };
}

