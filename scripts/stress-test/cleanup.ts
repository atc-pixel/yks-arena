/**
 * Cleanup Script - Test öncesi eski veriyi temizler
 * 
 * - Test botlarının activeMatchCount'larını sıfırlar
 * - match_queue'daki eski ticket'ları siler
 */

import * as admin from "firebase-admin";
import { FIREBASE_CONFIG, TEST_CONFIG } from "./config";

async function cleanup() {
  // Admin SDK initialize
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: FIREBASE_CONFIG.projectId,
    });
  }
  process.env.FIRESTORE_EMULATOR_HOST = TEST_CONFIG.FIRESTORE_EMULATOR_HOST;
  
  const db = admin.firestore();
  
  console.log("🧹 Cleaning up old test data...\n");
  
  // 1. Delete all match_queue tickets
  const queueSnap = await db.collection("match_queue").get();
  if (!queueSnap.empty) {
    const batch = db.batch();
    queueSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`✅ Deleted ${queueSnap.size} match_queue tickets`);
  } else {
    console.log("✅ match_queue already empty");
  }
  
  // 2. Reset activeMatchCount for test bots (uid starts with "bot-")
  const usersSnap = await db.collection("users")
    .orderBy(admin.firestore.FieldPath.documentId())
    .startAt("bot-")
    .endAt("bot-\uf8ff")
    .get();
  
  if (!usersSnap.empty) {
    const batch = db.batch();
    usersSnap.docs.forEach(doc => {
      batch.update(doc.ref, { "presence.activeMatchCount": 0 });
    });
    await batch.commit();
    console.log(`✅ Reset activeMatchCount for ${usersSnap.size} test bots`);
  } else {
    console.log("✅ No test bots found");
  }
  
  // 3. Reset bot_pool (all IN_USE -> AVAILABLE)
  const inUseSnap = await db.collection("bot_pool")
    .where("status", "==", "IN_USE")
    .get();
  
  if (!inUseSnap.empty) {
    const batch = db.batch();
    inUseSnap.docs.forEach(doc => {
      batch.update(doc.ref, { status: "AVAILABLE" });
    });
    await batch.commit();
    console.log(`✅ Reset ${inUseSnap.size} passive bots to AVAILABLE`);
  } else {
    console.log("✅ All passive bots already AVAILABLE");
  }
  
  console.log("\n🎉 Cleanup complete!\n");
}

cleanup().catch(err => {
  console.error("💀 Cleanup failed:", err);
  process.exit(1);
});

