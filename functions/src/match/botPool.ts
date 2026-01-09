/**
 * Passive Bot Pool Management
 * 
 * Passive botlar ayrı "bot_pool" collection'da bekler.
 * 15 saniye içinde rakip bulunamazsa bot_pool dahil edilir.
 * Naming: bot_passive_xxx
 */

import { nanoid } from "nanoid";
import type { Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import { db, Timestamp } from "../utils/firestore";
import { MIN_BOT_POOL_SIZE } from "../shared/constants";
import { generateBotSkillVector } from "./matchmaking.utils";

// ============================================================================
// CONSTANTS
// ============================================================================

const BOT_POOL_COLLECTION = "bot_pool";
const BOT_BATCH_SIZE = 20; // Her seferde eklenecek bot sayısı

type BotProfile = "WEAK" | "AVERAGE" | "STRONG" | "PRO";

// Tiered distribution: %20 weak, %40 average, %30 strong, %10 pro
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

/**
 * Bot pool entry type (farklı status: AVAILABLE/IN_USE)
 */
export type BotPoolEntry = {
  uid: string;
  createdAt: FirestoreTimestamp;
  status: "AVAILABLE" | "IN_USE";
  skillVector: number[];
  botDifficulty: number;
};

/**
 * Tek bir passive bot oluştur.
 */
export function generatePassiveBot(): BotPoolEntry {
  const profile = pickRandom(PROFILE_DISTRIBUTION);
  const difficulties = DIFFICULTY_BY_PROFILE[profile];
  
  return {
    uid: `bot_passive_${nanoid(12)}`,
    createdAt: Timestamp.now(),
    status: "AVAILABLE",
    skillVector: generateBotSkillVector(profile),
    botDifficulty: pickRandom(difficulties),
  };
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Bot havuzunu kontrol et ve gerekirse doldur.
 * Transaction dışında çağrılmalı (async replenishment).
 */
export async function ensureBotPool(): Promise<{ added: number; total: number }> {
  const poolRef = db.collection(BOT_POOL_COLLECTION);
  
  // Count available bots in pool
  const availableBotsSnap = await poolRef
    .where("status", "==", "AVAILABLE")
    .count()
    .get();
  
  const currentBotCount = availableBotsSnap.data().count;
  
  // Enough bots? Exit early
  if (currentBotCount >= MIN_BOT_POOL_SIZE) {
    return { added: 0, total: currentBotCount };
  }
  
  // Calculate how many bots to add
  const botsNeeded = Math.min(
    MIN_BOT_POOL_SIZE - currentBotCount,
    BOT_BATCH_SIZE
  );
  
  // Batch write new bots
  const batch = db.batch();
  
  for (let i = 0; i < botsNeeded; i++) {
    const botData = generatePassiveBot();
    const docRef = poolRef.doc(botData.uid);
    batch.set(docRef, botData);
  }
  
  await batch.commit();
  
  console.log(`[BotPool] Added ${botsNeeded} passive bots. Total: ${currentBotCount + botsNeeded}`);
  
  return { added: botsNeeded, total: currentBotCount + botsNeeded };
}

/**
 * Consume edilen bot'un yerine yenisini ekle (async).
 * enterQueue'dan fire-and-forget olarak çağrılır.
 */
export async function replenishBot(): Promise<void> {
  try {
    const poolRef = db.collection(BOT_POOL_COLLECTION);
    const botData = generatePassiveBot();
    await poolRef.doc(botData.uid).set(botData);
    console.log(`[BotPool] Replenished: ${botData.uid}`);
  } catch (error) {
    console.error("[BotPool] Replenish failed:", error);
  }
}

/**
 * Bot pool collection adını export et (enterQueue'da kullanılacak)
 */
export const BOT_POOL_COLLECTION_NAME = BOT_POOL_COLLECTION;
