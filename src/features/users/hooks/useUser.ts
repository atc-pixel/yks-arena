"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { UserDocSchema } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import type { UserDoc } from "@/lib/validation/schemas";

/**
 * Real-time user subscription hook with Zod validation
 * 
 * Architecture Decision:
 * - Firestore'dan gelen user data'yı Zod ile validate ediyoruz
 * - Invalid data gelirse null döner (app crash olmaz)
 * - Presence field optional, Zod schema'da zaten optional olarak tanımlı
 * - Type-safe UserDoc döner
 */
export function useUser(uid: string | null) {
  const [user, setUser] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<string | null>(null);

  const ref = useMemo(() => (uid ? doc(db, "users", uid) : null), [uid]);

  useEffect(() => {
    let t0: ReturnType<typeof setTimeout> | null = null;

    if (!ref) {
      // react-hooks/set-state-in-effect: setState'i effect body'de direkt çağırma.
      t0 = setTimeout(() => {
        setUser(null);
        setLoading(false);
        setError(null);
      }, 0);

      return () => {
        if (t0) clearTimeout(t0);
      };
    }

    // Effect içi state sync yerine microtask/timer ile set et.
    t0 = setTimeout(() => {
      setLoading(true);
      setError(null);
    }, 0);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setUser(null);
          setLoading(false);
          return;
        }

        // Zod validation ile safe parse
        // Presence field zaten schema'da optional, backend'den gelmezse undefined olur
        const rawData = snap.data();
        const validated = safeParse(UserDocSchema, rawData, `useUser:${uid}`);
        setUser(validated);
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setError(e?.message || "User realtime subscription failed.");
        setLoading(false);
      }
    );

    return () => {
      if (t0) clearTimeout(t0);
      unsub();
    };
  }, [ref, uid]);

  return { user, loading, error };
}
