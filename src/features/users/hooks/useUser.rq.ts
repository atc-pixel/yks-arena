/**
 * useUser Hook (React Query Version)
 * 
 * Architecture Decision:
 * - User data React Query cache'inde tutulur
 * - Zustand store ile sync edilir (global state için)
 * - Aynı uid için birden fazla component kullanırsa, tek subscription yeterli
 */

"use client";

import { useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { UserDocSchema } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import { useFirestoreQuery } from "@/lib/react-query/firestore-adapter";
import { useUserStore } from "@/stores/userStore";
import type { UserDoc } from "@/lib/validation/schemas";

export function useUser(uid: string | null) {
  const setUser = useUserStore((state) => state.setUser);

  const { data: user, loading, error } = useFirestoreQuery<UserDoc>(
    uid ? ["user", uid] : ["user", "null"],
    (onNext) => {
      if (!uid) {
        onNext(null);
        return () => {}; // No-op unsubscribe
      }

      const ref = doc(db, "users", uid);
      
      const unsubscribe = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            onNext(null);
            return;
          }

          const rawData = snap.data();
          const validated = safeParse(UserDocSchema, rawData, `useUser:${uid}`);
          onNext(validated);
        },
        (err) => {
          console.error("useUser snapshot error:", err);
          onNext(null);
        }
      );

      return unsubscribe;
    }
  );

  // Sync with Zustand store
  useEffect(() => {
    setUser(user ?? null);
  }, [user, setUser]);

  return { user, loading, error: error ? new Error(error.message || "User fetch failed") : null };
}

