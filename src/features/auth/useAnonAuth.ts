"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { ensureUserDoc } from "@/features/match/services/match.api";

/**
 * Anonymous Authentication Hook
 * 
 * Architecture Decision:
 * - Production: Backend'de Gen 1 auth.user().onCreate trigger otomatik çalışır
 * - Emulator: Gen 1 trigger çalışmadığı için callable function kullanıyoruz (geçici)
 * - ensureUserDoc idempotent (zaten varsa ignore eder)
 * - useUser hook'u Firestore'dan real-time olarak user data'yı çeker
 */
export function useAnonAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          await signInAnonymously(auth);
          return;
        }

        // Geçici: Emulator desteği için callable function çağırıyoruz
        // Production'da auth trigger zaten çalışıyor (idempotent, zararsız)
        try {
          await ensureUserDoc();
        } catch (e) {
          // Silent fail - auth trigger production'da zaten çalışıyor
          console.warn("[useAnonAuth] ensureUserDoc failed (expected in production):", e);
        }

        setUser(u);
        setReady(true);
      } catch (e) {
        console.error(e);
        setError("Anon giriş yapılamadı. Emulator/auth ayarlarını kontrol et.");
      }
    });

    return () => unsub();
  }, []);

  return { user, ready, error };
}
