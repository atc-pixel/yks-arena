/**
 * useLeagueBucket Hook (React Query Version)
 * 
 * Architecture Decision:
 * - User'ın currentBucketId'sine göre bucket'ı real-time subscribe ediyoruz
 * - Bucket yoksa veya Teneke ligindeyse null döner
 */

"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { LeagueBucketSchema } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import { useFirestoreQuery } from "@/lib/react-query/firestore-adapter";
import type { LeagueBucket } from "@/lib/validation/schemas";

const LEAGUES_COLLECTION = "leagues";

export function useLeagueBucket(bucketId: string | null | undefined) {
  const { data, loading, error } = useFirestoreQuery<LeagueBucket>(
    bucketId ? ["leagueBucket", bucketId] : ["leagueBucket", "null"],
    (onNext) => {
      if (!bucketId) {
        onNext(null);
        return () => {}; // No-op unsubscribe
      }

      const ref = doc(db, LEAGUES_COLLECTION, bucketId);
      
      const unsubscribe = onSnapshot(
        ref,
        // DÜZELTME: Options parametresi buraya, callbacklerden önce gelmeli
        { includeMetadataChanges: false },
        (snap) => {
          if (!snap.exists()) {
            onNext(null);
            return;
          }

          const rawData = snap.data();
          const validated = safeParse(LeagueBucketSchema, rawData, `useLeagueBucket:${bucketId}`);
          onNext(validated);
        },
        (err) => {
          console.error("useLeagueBucket snapshot error:", err);
          // Error durumunda null döndür, component error handling yapsın
          onNext(null);
        }
        // Sondaki options nesnesi buradan silindi
      );

      return unsubscribe;
    }
  );

  return { bucket: data, loading, error };
}

