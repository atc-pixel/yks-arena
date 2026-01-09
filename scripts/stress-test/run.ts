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
 * 
 * Architecture Decision:
 * - Pool seeding: pool-seeder.ts
 * - Reporting: reporter.ts
 * - Match execution: match-runner.ts
 */

import path from "node:path";
import dotenv from "dotenv";

// Load env before anything else
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { runMatch, runParallelMatches, runQueueMatch, runParallelQueueMatches } from "./match-runner";
import { getTestBots } from "./test-bot-registry";
import { BOT_CONFIG, type MatchMetrics } from "./config";
import { ensurePassiveBotPool } from "./pool-seeder";
import { printSummary } from "./reporter";

// ============================================================================
// SINGLE MATCH RUNNERS
// ============================================================================

async function runSingleMatch(): Promise<boolean> {
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

async function runMultipleMatches(count: number): Promise<boolean> {
  console.log(`🎯 Running ${count} parallel invite matches (${count * 2} bots)\n`);
  
  const results = await runParallelMatches(count);
  printSummary(results);
  
  const failedCount = results.filter(r => r.errors.length > 0).length;
  return failedCount === 0;
}

// ============================================================================
// QUEUE MATCH RUNNERS
// ============================================================================

async function runSingleQueueMatch(): Promise<boolean> {
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

async function runMultipleQueueMatches(count: number): Promise<boolean> {
  console.log(`🎯 Running ${count} parallel queue matches (vs passive bot pool)\n`);
  
  const results = await runParallelQueueMatches(count);
  printSummary(results);
  
  const failedCount = results.filter(r => r.errors.length > 0).length;
  return failedCount === 0;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
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
