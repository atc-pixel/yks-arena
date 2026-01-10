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
    // #region agent log
    const log = (msg: string, data: any, hypothesisId?: string) => {
      fetch('http://127.0.0.1:7242/ingest/36a93515-5c69-4ba7-b207-97735e7b3a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUser.ts',message:msg,data:data,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:hypothesisId||'H2'})}).catch(()=>{});
    };
    log('useUser:EFFECT_START', { uid, hasRef: !!ref }, 'H2');
    // #endregion

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
        // #region agent log
        log('useUser:SNAPSHOT', { exists: snap.exists(), uid }, 'H2');
        // #endregion
        if (!snap.exists()) {
          // #region agent log
          log('useUser:NO_DOC', { uid }, 'H2');
          // #endregion
          setUser(null);
          setLoading(false);
          return;
        }

        // Zod validation ile safe parse
        // Presence field zaten schema'da optional, backend'den gelmezse undefined olur
        const rawData = snap.data();
        // #region agent log
        log('useUser:BEFORE_VALIDATE', { uid, hasRawData: !!rawData, fields: rawData ? Object.keys(rawData) : [] }, 'H2');
        // #endregion
        const validated = safeParse(UserDocSchema, rawData, `useUser:${uid}`);
        // #region agent log
        log('useUser:AFTER_VALIDATE', { uid, isValid: !!validated }, 'H2');
        // #endregion
        setUser(validated);
        setLoading(false);
      },
      (e) => {
        // #region agent log
        log('useUser:ERROR', { error: e?.message || String(e), uid }, 'H2');
        // #endregion
        console.error(e);
        setError(e?.message || "User realtime subscription failed.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [ref, uid]);

  return { user, loading, error };
}
