/**
 * Reporter - Test sonuçlarını özetler ve gösterir
 * 
 * Architecture Decision:
 * - run.ts'den ayrıldı (200+ satır kuralı)
 */

import type { MatchMetrics } from "./config";

/**
 * Test sonuçlarını özetleyen rapor yazdırır
 */
export function printSummary(results: MatchMetrics[]): void {
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

