/**
 * ensureUserDocCallable (Geçici - Emulator Desteği)
 * 
 * Architecture Decision:
 * - Gen 1 auth trigger emulator'da çalışmıyor
 * - Emulator'da test için geçici olarak callable function kullanıyoruz
 * - Frontend'de auth başarılı olduktan sonra çağrılır
 * - Production'da auth trigger zaten çalışıyor (idempotent)
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ensureUserDoc } from "./ensure";

export const ensureUserDocCallable = onCall(
  { region: "us-central1" },
  async (req) => {
    try {
      const uid = req.auth?.uid;
      if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

      // ensureUserDoc zaten idempotent (zaten varsa ignore eder)
      await ensureUserDoc(uid);

      return { success: true };
    } catch (error) {
      console.error("[ensureUserDocCallable] Error:", error);
      throw error;
    }
  }
);
