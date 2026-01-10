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
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          await signInAnonymously(auth);
          return;
        }

        // User Auth'da var, backend trigger otomatik olarak Firestore'da users/{uid} oluşturacak
        // useUser hook'u real-time subscription ile bekliyor
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
