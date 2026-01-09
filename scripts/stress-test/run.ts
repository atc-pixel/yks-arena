#!/usr/bin/env npx tsx
/**
 * Stress Test Runner
 * 
 * Usage:
 *   npx tsx scripts/stress-test/run.ts [matchCount] [--mode=invite|queue]
 * 
 * Examples:
 *   npx tsx scripts/stress-test/run.ts              # 1 invite match (2 bots)
 *   npx tsx scripts/stress-test/run.ts 10           # 10 invite matches (20 bots)
 *   npx tsx scripts/stress-test/run.ts 10 --queue   # 10 queue matches (vs passive bots)
 *   npx tsx scripts/stress-test/run.ts 50 --queue   # 50 queue matches
 */

import path from "node:path";
import dotenv from "dotenv";

// Load env before anything else
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import * as admin from "firebase-admin";
import { nanoid } from "nanoid";
import { runMatch, runParallelMatches, runQueueMatch, runParallelQueueMatches } from "./match-runner";
import { getTestBots } from "./test-bot-registry";
import { BOT_CONFIG, FIREBASE_CONFIG, TEST_CONFIG, type MatchMetrics } from "./config";

// ============================================================================
// PASSIVE BOT POOL SEEDING
// ============================================================================

const MIN_PASSIVE_BOT_COUNT = 50;

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

/**
 * Test başlamadan önce passive bot pool'u doldur (Admin SDK ile)
 */
async function ensurePassiveBotPool(): Promise<{ added: number; total: number }> {
  // Admin SDK initialize
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: FIREBASE_CONFIG.projectId,
    });
  }
  process.env.FIRESTORE_EMULATOR_HOST = TEST_CONFIG.FIRESTORE_EMULATOR_HOST;
  
  const db = admin.firestore();
  const queueRef = db.collection("match_queue");
  
  // Mevcut passive bot sayısını kontrol et
  const existingSnap = await queueRef
    .where("isBot", "==", true)
    .where("status", "==", "WAITING")
    .count()
    .get();
  
  const currentCount = existingSnap.data().count;
  
  if (currentCount >= MIN_PASSIVE_BOT_COUNT) {
    console.log(`✅ Passive bot pool ready: ${currentCount} bots`);
    return { added: 0, total: currentCount };
  }
  
  // Eksik botları ekle
  const botsNeeded = MIN_PASSIVE_BOT_COUNT - currentCount;
  console.log(`🤖 Seeding passive bot pool: adding ${botsNeeded} bots...`);
  
  const batch = db.batch();
  
  for (let i = 0; i < botsNeeded; i++) {
    const profile = pickRandom(PROFILE_DISTRIBUTION);
    const difficulty = pickRandom(DIFFICULTY_BY_PROFILE[profile]);
    const uid = `bot_passive_${nanoid(12)}`;
    
    const ticket = {
      uid,
      createdAt: admin.firestore.Timestamp.now(),
      status: "WAITING",
      skillVector: generateBotSkillVector(profile),
      isBot: true,
      botDifficulty: difficulty,
    };
    
    batch.set(queueRef.doc(uid), ticket);
  }
  
  await batch.commit();
  
  const total = currentCount + botsNeeded;
  console.log(`✅ Passive bot pool seeded: ${total} bots ready\n`);
  
  return { added: botsNeeded, total };
}

function printSummary(results: MatchMetrics[]) {
  console.log("\n" + "=".repeat(60));
  console.log("📊 STRESS TEST SUMMARY");
  console.log("=".repeat(60));
  
  const successful = results.filter(r => r.errors.length === 0);
  const failed = results.filter(r => r.errors.length > 0);
  
  console.log(`\n✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  
  if (results.length > 0) {
    const durations = results.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    const turns = results.map(r => r.totalTurns);
    const avgTurns = turns.reduce((a, b) => a + b, 0) / turns.length;
    
    console.log(`\n⏱️ Duration:`);
    console.log(`   Average: ${avgDuration.toFixed(0)}ms`);
    console.log(`   Min: ${minDuration}ms`);
    console.log(`   Max: ${maxDuration}ms`);
    
    console.log(`\n🔄 Turns:`);
    console.log(`   Average: ${avgTurns.toFixed(1)} turns/match`);
  }
  
  if (failed.length > 0) {
    console.log(`\n❌ Errors:`);
    for (const f of failed) {
      console.log(`   Match ${f.matchId.slice(0, 8)}: ${f.errors.join(", ")}`);
    }
  }
  
  console.log("\n" + "=".repeat(60) + "\n");
}

async function runSingleMatch() {
  console.log("🎯 Running single match test (2 bots)\n");
  
  // Test Bot Registry'den 2 bot al (mevcut varsa yeniden kullan)
  const { bots, reusedCount, newCount } = await getTestBots(2);
  const [botA, botB] = bots;
  console.log(`♻️  Reused: ${reusedCount}, New: ${newCount}\n`);
  
  try {
    await botA.init();
    await botB.init();
    
    const result = await runMatch(botA, botB);
    printSummary([result]);
    
    return result.errors.length === 0;
  } finally {
    await botA.destroy();
    await botB.destroy();
  }
}

async function runMultipleMatches(count: number) {
  console.log(`🎯 Running ${count} parallel invite matches (${count * 2} bots)\n`);
  
  const results = await runParallelMatches(count);
  printSummary(results);
  
  const failedCount = results.filter(r => r.errors.length > 0).length;
  return failedCount === 0;
}

async function runSingleQueueMatch() {
  console.log("🎯 Running single queue match (1 bot vs passive bot pool)\n");
  console.log(`📊 Rematch chance: ${Math.round(BOT_CONFIG.REMATCH_CHANCE * 100)}%\n`);
  
  const { bots, reusedCount, newCount } = await getTestBots(1);
  const [bot] = bots;
  console.log(`♻️  Reused: ${reusedCount}, New: ${newCount}\n`);
  
  const allResults: MatchMetrics[] = [];
  
  try {
    await bot.init();
    
    // İlk maç
    let result = await runQueueMatch(bot);
    allResults.push(result);
    
    // Rematch loop: %10 ihtimalle tekrar maç ara
    let rematchCount = 0;
    while (Math.random() < BOT_CONFIG.REMATCH_CHANCE && result.errors.length === 0) {
      rematchCount++;
      console.log(`\n🔄 REMATCH #${rematchCount}! (${Math.round(BOT_CONFIG.REMATCH_CHANCE * 100)}% chance triggered)`);
      
      // Kısa bekleme
      await new Promise(r => setTimeout(r, 500));
      
      result = await runQueueMatch(bot);
      allResults.push(result);
    }
    
    if (rematchCount > 0) {
      console.log(`\n📊 Total matches played: ${allResults.length} (${rematchCount} rematches)`);
    }
    
    printSummary(allResults);
    return allResults.every(r => r.errors.length === 0);
  } finally {
    await bot.destroy();
  }
}

async function runMultipleQueueMatches(count: number) {
  console.log(`🎯 Running ${count} parallel queue matches (vs passive bot pool)\n`);
  
  const results = await runParallelQueueMatches(count);
  printSummary(results);
  
  const failedCount = results.filter(r => r.errors.length > 0).length;
  return failedCount === 0;
}

async function main() {
  const args = process.argv.slice(2);
  const isQueueMode = args.includes("--queue");
  const numericArgs = args.filter(a => !a.startsWith("--"));
  const matchCount = parseInt(numericArgs[0] || "1", 10);
  
  if (isNaN(matchCount) || matchCount < 1) {
    console.error("Usage: npx tsx scripts/stress-test/run.ts [matchCount] [--queue]");
    console.error("  matchCount must be a positive integer");
    console.error("  --queue: use queue-based matchmaking (vs passive bots)");
    process.exit(1);
  }
  
  console.log("\n" + "🔥".repeat(30));
  console.log("       YKS ARENA STRESS TEST");
  console.log("🔥".repeat(30) + "\n");
  
  console.log("⚠️  Make sure Firebase emulators are running:");
  console.log("    cd functions && npm run serve\n");
  
  const mode = isQueueMode ? "QUEUE" : "INVITE";
  console.log(`📋 Mode: ${mode}`);
  console.log(`📋 Matches: ${matchCount}\n`);
  
  let success: boolean;
  
  if (isQueueMode) {
    // Queue mode: bots match with passive bot pool
    // Önce passive bot pool'u doldur
    await ensurePassiveBotPool();
    
    if (matchCount === 1) {
      success = await runSingleQueueMatch();
    } else {
      success = await runMultipleQueueMatches(matchCount);
    }
  } else {
    // Invite mode: bots match with each other
    if (matchCount === 1) {
      success = await runSingleMatch();
    } else {
      success = await runMultipleMatches(matchCount);
    }
  }
  
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error("💀 Stress test crashed:", err);
  process.exit(1);
});

