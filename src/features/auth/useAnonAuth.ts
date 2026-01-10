"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

/**
 * Anonymous Authentication Hook
 * 
 * Architecture Decision:
 * - Frontend'den user profile oluşturma çağrısı YOK
 * - Backend'de Gen 1 auth.user().onCreate trigger otomatik çalışır
 * - Trigger Auth'a yazıldıktan sonra Firestore'da users/{uid} oluşturur
 * - useUser hook'u Firestore'dan real-time olarak user data'yı çeker
 */
export function useAnonAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // #region agent log
    const log = (msg: string, data: any, hypothesisId?: string) => {
      fetch('http://127.0.0.1:7242/ingest/36a93515-5c69-4ba7-b207-97735e7b3a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useAnonAuth.ts',message:msg,data:data,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:hypothesisId||'H2'})}).catch(()=>{});
    };
    log('useAnonAuth:EFFECT_START', {}, 'H2');
    // #endregion

    const unsub = onAuthStateChanged(auth, async (u) => {
      // #region agent log
      log('useAnonAuth:ON_AUTH_STATE', { hasUser: !!u, uid: u?.uid }, 'H2');
      // #endregion
      try {
        if (!u) {
          // #region agent log
          log('useAnonAuth:SIGNING_IN', {}, 'H2');
          // #endregion
          await signInAnonymously(auth);
          return;
        }

        // User Auth'da var, backend trigger otomatik olarak Firestore'da users/{uid} oluşturacak
        // useUser hook'u real-time subscription ile bekliyor
        // #region agent log
        log('useAnonAuth:USER_READY', { uid: u.uid }, 'H2');
        // #endregion
        setUser(u);
        setReady(true);
      } catch (e) {
        // #region agent log
        log('useAnonAuth:ERROR', { error: e instanceof Error ? e.message : String(e) }, 'H2');
        // #endregion
        console.error(e);
        setError("Anon giriş yapılamadı. Emulator/auth ayarlarını kontrol et.");
      }
    });

    return () => unsub();
  }, []);

  return { user, ready, error };
}
