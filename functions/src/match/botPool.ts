/**
 * Passive Bot Pool Management
 * 
 * Passive botlar match_queue'da bekler, sadece eşleştirilmeyi bekler.
 * Naming: bot_passive_xxx
 */

import { nanoid } from "nanoid";
import { db, Timestamp } from "../utils/firestore";
import { MIN_BOT_POOL_SIZE } from "../shared/constants";
import type { QueueTicket } from "../shared/types";
import { generateBotSkillVector } from "./matchmaking.utils";

// ============================================================================
// CONSTANTS
// ============================================================================

const MATCH_QUEUE_COLLECTION = "match_queue";
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
 * Tek bir passive bot ticket oluştur.
 */
export function generatePassiveBot(): QueueTicket {
  const profile = pickRandom(PROFILE_DISTRIBUTION);
  const difficulties = DIFFICULTY_BY_PROFILE[profile];
  
  return {
    uid: `bot_passive_${nanoid(12)}`,
    createdAt: Timestamp.now(),
    status: "WAITING",
    skillVector: generateBotSkillVector(profile),
    isBot: true,
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
  const queueRef = db.collection(MATCH_QUEUE_COLLECTION);
  
  // Count waiting passive bots
  const waitingBotsSnap = await queueRef
    .where("isBot", "==", true)
    .where("status", "==", "WAITING")
    .count()
    .get();
  
  const currentBotCount = waitingBotsSnap.data().count;
  
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
    const botTicket = generatePassiveBot();
    const docRef = queueRef.doc(botTicket.uid);
    batch.set(docRef, botTicket);
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
    const queueRef = db.collection(MATCH_QUEUE_COLLECTION);
    const botTicket = generatePassiveBot();
    await queueRef.doc(botTicket.uid).set(botTicket);
    console.log(`[BotPool] Replenished: ${botTicket.uid}`);
  } catch (error) {
    console.error("[BotPool] Replenish failed:", error);
  }
}

