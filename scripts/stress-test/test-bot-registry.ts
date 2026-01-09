/**
 * Test Bot Registry - Mevcut test botlarını yeniden kullanır, eksik kalanları oluşturur
 * 
 * NOT: Bu "passive bot pool" ile KARIŞTIRILMAMALI!
 * - Passive Bot Pool (functions/src/match/botPool.ts): Queue'da bekleyen gerçek matchmaking botları
 * - Test Bot Registry (bu dosya): Stress test için Firestore'daki mevcut user'ları yeniden kullanma optimizasyonu
 * 
 * Bu sayede her test çalıştırmasında yeni user document'ları oluşturulmaz,
 * Firestore'daki mevcut test bot'lar yeniden kullanılır.
 */

import * as admin from "firebase-admin";
import { Bot } from "./bot";
import { FIREBASE_CONFIG, TEST_CONFIG } from "./config";

// Admin SDK'yı initialize et (bot.ts ile aynı pattern)
function ensureAdminInit() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: FIREBASE_CONFIG.projectId,
    });
  }
  process.env.FIRESTORE_EMULATOR_HOST = TEST_CONFIG.FIRESTORE_EMULATOR_HOST;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = TEST_CONFIG.AUTH_EMULATOR_HOST;
}

/**
 * Firestore'dan mevcut test bot uid'lerini çeker
 * Test bot uid'leri "bot-" ile başlar
 */
async function getExistingTestBotUids(): Promise<string[]> {
  ensureAdminInit();
  const db = admin.firestore();
  
  // Firestore'da uid "bot-" ile başlayan user'ları bul
  // DocumentId üzerinde range query yapıyoruz
  const snapshot = await db.collection("users")
    .orderBy(admin.firestore.FieldPath.documentId())
    .startAt("bot-")
    .endAt("bot-\uf8ff") // Unicode high character for range end
    .limit(500)
    .get();
  
  const uids = snapshot.docs.map(doc => doc.id);
  console.log(`📦 Found ${uids.length} existing test bots in Firestore`);
  
  return uids;
}

export interface TestBotRegistryResult {
  bots: Bot[];
  reusedCount: number;
  newCount: number;
}

/**
 * İstenen sayıda test bot döner
 * - Önce Firestore'daki mevcut test bot'ları kullanır
 * - Eksik kalanları yeni oluşturur
 */
export async function getTestBots(count: number): Promise<TestBotRegistryResult> {
  const existingUids = await getExistingTestBotUids();
  const bots: Bot[] = [];
  
  const reusedCount = Math.min(count, existingUids.length);
  const newCount = Math.max(0, count - existingUids.length);
  
  // Mevcut test bot'ları kullan
  for (let i = 0; i < reusedCount; i++) {
    bots.push(new Bot(`R${i}`, existingUids[i]));
  }
  
  // Eksik kalanları yeni oluştur
  for (let i = 0; i < newCount; i++) {
    bots.push(new Bot(`N${i}`));
  }
  
  console.log(`📦 Test Bot Registry: ${reusedCount} reused, ${newCount} new (total: ${count})`);
  
  return { bots, reusedCount, newCount };
}

/**
 * Maçlar için test bot çiftleri oluşturur
 * Her maç için 2 bot gerekir
 */
export async function getTestBotPairs(matchCount: number): Promise<{ pairs: [Bot, Bot][]; stats: { reused: number; new: number } }> {
  const totalBots = matchCount * 2;
  const { bots, reusedCount, newCount } = await getTestBots(totalBots);
  
  const pairs: [Bot, Bot][] = [];
  for (let i = 0; i < matchCount; i++) {
    pairs.push([bots[i * 2], bots[i * 2 + 1]]);
  }
  
  return { 
    pairs, 
    stats: { reused: reusedCount, new: newCount } 
  };
}

