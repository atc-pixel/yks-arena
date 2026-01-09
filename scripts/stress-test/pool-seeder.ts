/**
 * Pool Seeder - Passive bot pool'u doldurur
 * 
 * Test başlamadan önce yeterli sayıda passive bot'un bot_pool
 * collection'da beklemesini sağlar. Admin SDK ile direkt Firestore'a yazar.
 * 
 * Yeni mimari:
 * - Passive botlar `bot_pool` collection'da (ayrı)
 * - Status: AVAILABLE (kullanılabilir) / IN_USE (maçta)
 * - 15 saniye sonra match_queue'ya dahil edilir
 */

import * as admin from "firebase-admin";
import { nanoid } from "nanoid";
import { FIREBASE_CONFIG, TEST_CONFIG } from "./config";

// ============================================================================
// CONSTANTS
// ============================================================================

export const MIN_PASSIVE_BOT_COUNT = 50;
const BOT_POOL_COLLECTION = "bot_pool";

type BotProfile = "WEAK" | "AVERAGE" | "STRONG" | "PRO";

const PROFILE_DISTRIBUTION: BotProfile[] = [
  "WEAK", "WEAK",
  "AVERAGE", "AVERAGE", "AVERAGE", "AVERAGE",
  "STRONG", "STRONG", "STRONG",
  "PRO",
];

const DIFFICULTY_BY_PROFILE: Record<BotProfile, number[]> = {
  WEAK: [1, 2, 3],
  AVERAGE: [4, 5, 6],
  STRONG: [7, 8],
  PRO: [9, 10],
};

// ============================================================================
// HELPERS
// ============================================================================

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateBotSkillVector(profile: BotProfile): number[] {
  const profiles = {
    WEAK: { min: 20, max: 40 },
    AVERAGE: { min: 40, max: 60 },
    STRONG: { min: 60, max: 80 },
    PRO: { min: 80, max: 95 },
  };
  
  const { min, max } = profiles[profile];
  const randomBetween = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
  
  return [
    randomBetween(min, max), // BILIM
    randomBetween(min, max), // COGRAFYA
    randomBetween(min, max), // SPOR
    randomBetween(min, max), // MATEMATIK
    randomBetween(min, max), // NormalizedTrophies
  ];
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Test başlamadan önce passive bot pool'u doldur (Admin SDK ile)
 */
export async function ensurePassiveBotPool(): Promise<{ added: number; total: number }> {
  // Admin SDK initialize
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: FIREBASE_CONFIG.projectId,
    });
  }
  process.env.FIRESTORE_EMULATOR_HOST = TEST_CONFIG.FIRESTORE_EMULATOR_HOST;
  
  const db = admin.firestore();
  const poolRef = db.collection(BOT_POOL_COLLECTION);
  
  // Mevcut available bot sayısını kontrol et
  const existingSnap = await poolRef
    .where("status", "==", "AVAILABLE")
    .count()
    .get();
  
  const currentCount = existingSnap.data().count;
  
  if (currentCount >= MIN_PASSIVE_BOT_COUNT) {
    console.log(`✅ Passive bot pool ready: ${currentCount} bots in bot_pool`);
    return { added: 0, total: currentCount };
  }
  
  // Eksik botları ekle
  const botsNeeded = MIN_PASSIVE_BOT_COUNT - currentCount;
  console.log(`🤖 Seeding bot_pool: adding ${botsNeeded} passive bots...`);
  
  const batch = db.batch();
  
  for (let i = 0; i < botsNeeded; i++) {
    const profile = pickRandom(PROFILE_DISTRIBUTION);
    const difficulty = pickRandom(DIFFICULTY_BY_PROFILE[profile]);
    const uid = `bot_passive_${nanoid(12)}`;
    
    const botData = {
      uid,
      createdAt: admin.firestore.Timestamp.now(),
      status: "AVAILABLE", // bot_pool'da AVAILABLE kullanıyoruz
      skillVector: generateBotSkillVector(profile),
      botDifficulty: difficulty,
    };
    
    batch.set(poolRef.doc(uid), botData);
  }
  
  await batch.commit();
  
  const total = currentCount + botsNeeded;
  console.log(`✅ bot_pool seeded: ${total} passive bots ready\n`);
  
  return { added: botsNeeded, total };
}

/**
 * Tüm IN_USE botları AVAILABLE'a çevir (cleanup)
 */
export async function resetBotPool(): Promise<number> {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: FIREBASE_CONFIG.projectId,
    });
  }
  process.env.FIRESTORE_EMULATOR_HOST = TEST_CONFIG.FIRESTORE_EMULATOR_HOST;
  
  const db = admin.firestore();
  const poolRef = db.collection(BOT_POOL_COLLECTION);
  
  const inUseSnap = await poolRef
    .where("status", "==", "IN_USE")
    .get();
  
  if (inUseSnap.empty) {
    return 0;
  }
  
  const batch = db.batch();
  inUseSnap.docs.forEach(doc => {
    batch.update(doc.ref, { status: "AVAILABLE" });
  });
  
  await batch.commit();
  
  console.log(`♻️  Reset ${inUseSnap.size} bots from IN_USE to AVAILABLE`);
  return inUseSnap.size;
}
