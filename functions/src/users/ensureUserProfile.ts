/**
 * Gen 1 Auth Trigger (Otomatik, Maliyetsiz, Güvenilir)
 * 
 * Architecture Decision:
 * - Gen 1 auth.user().onCreate trigger kullanıyoruz (Spark planında bile çalışır)
 * - Otomatik çalışır, blocking function gibi enable etmeye gerek yok
 * - Kullanıcı Auth'a yazıldıktan SONRA çalışır (asenkron)
 * - Idempotent: Zaten varsa tekrar oluşturmaz
 */
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { USER_COLLECTION } from "./types";
import { guestNameFromUid } from "./utils";

// Admin SDK başlatma
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Kullanıcı Authentication servisine yazıldığında otomatik çalışır.
 * Firestore'da users/{uid} dokümanını oluşturur.
 * 
 * Architecture Decision:
 * - Region: europe-west1 (diğer functions ile aynı)
 * - Gen 1 functions için CPU/memory ayarı yapılamaz (Spark planında çalışır)
 */
export const ensureUserProfile = functions
  .region("us-central1")
  .auth.user()
  .onCreate(async (user) => {
  try {
    const db = admin.firestore();
    const uid = user.uid;
    const userRef = db.collection(USER_COLLECTION).doc(uid);

    // Idempotency Check (Mükerrer kaydı önle)
    const existing = await userRef.get();
    if (existing.exists) {
      console.log(`[ensureUserProfile] User already exists: ${uid}`);
      return;
    }

    // Profil Oluştur
    const initialProfile = {
      displayName: guestNameFromUid(uid),
      photoURL: user.photoURL || null,

      trophies: 0,
      level: 1,

      league: { currentLeague: "Teneke", weeklyTrophies: 0 },
      stats: { totalMatches: 0, totalWins: 0 },

      economy: {
        energy: 30, // Bonkör başlangıç
        maxEnergy: 5,
        lastEnergyRefill: admin.firestore.FieldValue.serverTimestamp(),
      },

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await userRef.set(initialProfile);
    console.log(`[ensureUserProfile] Profile created for: ${uid}`);

  } catch (error) {
    console.error(`[ensureUserProfile] Error creating profile for ${user.uid}:`, error);
    // Trigger hatalarını yutmamak lazım ama sonsuz döngüye girmesin diye re-throw yapmıyoruz
  }
});