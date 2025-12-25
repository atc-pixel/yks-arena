"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase/client";

// Callable reference (created once)
const ensureUserProfile = httpsCallable(functions, "ensureUserProfile");

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

        // 🔥 ensure Firestore users/{uid} exists (idempotent)
        try {
          await ensureUserProfile();
        } catch (e) {
          // Non-fatal: don't block gameplay if profile creation fails temporarily
          console.error("ensureUserProfile failed", e);
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
