#!/usr/bin/env npx tsx
/**
 * Stress Test Runner
 * 
 * Usage:
 *   npx tsx scripts/stress-test/run.ts [matchCount]
 * 
 * Examples:
 *   npx tsx scripts/stress-test/run.ts       # 1 match (2 bots)
 *   npx tsx scripts/stress-test/run.ts 10    # 10 matches (20 bots)
 *   npx tsx scripts/stress-test/run.ts 50    # 50 matches (100 bots)
 */

import path from "node:path";
import dotenv from "dotenv";

// Load env before anything else
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { runMatch, runParallelMatches } from "./match-runner";
import { getBotPool } from "./bot-pool";
import type { MatchMetrics } from "./config";

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
  
  // Bot Pool'dan 2 bot al (mevcut varsa yeniden kullan)
  const { bots, reusedCount, newCount } = await getBotPool(2);
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
  console.log(`🎯 Running ${count} parallel matches (${count * 2} bots)\n`);
  
  const results = await runParallelMatches(count);
  printSummary(results);
  
  const failedCount = results.filter(r => r.errors.length > 0).length;
  return failedCount === 0;
}

async function main() {
  const args = process.argv.slice(2);
  const matchCount = parseInt(args[0] || "1", 10);
  
  if (isNaN(matchCount) || matchCount < 1) {
    console.error("Usage: npx tsx scripts/stress-test/run.ts [matchCount]");
    console.error("  matchCount must be a positive integer");
    process.exit(1);
  }
  
  console.log("\n" + "🔥".repeat(30));
  console.log("       YKS ARENA STRESS TEST");
  console.log("🔥".repeat(30) + "\n");
  
  console.log("⚠️  Make sure Firebase emulators are running:");
  console.log("    cd functions && npm run serve\n");
  
  let success: boolean;
  
  if (matchCount === 1) {
    success = await runSingleMatch();
  } else {
    success = await runMultipleMatches(matchCount);
  }
  
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error("💀 Stress test crashed:", err);
  process.exit(1);
});

