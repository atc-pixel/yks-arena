/**
 * useLeagueMeta Hook (React Query Version)
 * 
 * Architecture Decision:
 * - League meta data'yı real-time subscribe ediyoruz
 * - lastResetAt ve currentSeasonId bilgilerini alıyoruz
 */

"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { LeagueMetaSchema } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import { useFirestoreQuery } from "@/lib/react-query/firestore-adapter";
import type { LeagueMeta } from "@/lib/validation/schemas";

const SYSTEM_COLLECTION = "system";
const LEAGUE_META_DOC_ID = "league_meta";

export function useLeagueMeta() {
  const { data, loading, error } = useFirestoreQuery<LeagueMeta>(
    ["leagueMeta"],
    (onNext) => {
      const ref = doc(db, SYSTEM_COLLECTION, LEAGUE_META_DOC_ID);
      
      const unsubscribe = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            onNext(null);
            return;
          }

          const rawData = snap.data();
          const validated = safeParse(LeagueMetaSchema, rawData, "useLeagueMeta");
          onNext(validated);
        },
        (err) => {
          console.error("useLeagueMeta snapshot error:", err);
          // Error durumunda null döndür, component error handling yapsın
          // Rules hatası olabilir, emulator'ı restart etmeyi dene
          if (err?.code === "permission-denied" || err?.message?.includes("false for 'get'")) {
            console.warn("[useLeagueMeta] Permission denied - check Firestore rules and emulator restart");
          }
          onNext(null);
        },
        { includeMetadataChanges: false }
      );

      return unsubscribe;
    }
  );

  return { leagueMeta: data, loading, error };
}

