/**
 * Match Runner - 2 botu eşleştirip maç oynatır
 * 
 * Flow:
 * 1. Bot A invite oluşturur
 * 2. Bot B katılır  
 * 3. Sırayla: SPIN → QUESTION → RESULT → ... → END
 */

import * as admin from "firebase-admin";
import { Bot } from "./bot";
import { getBotPairsForMatches } from "./bot-pool";
import { TEST_CONFIG, type MatchMetrics, type TurnPhase } from "./config";

// Firestore'dan match okumak için helper
async function getMatch(matchId: string) {
  const db = admin.firestore();
  const snap = await db.collection("matches").doc(matchId).get();
  if (!snap.exists) throw new Error(`Match ${matchId} not found`);
  return snap.data() as {
    status: string;
    turn: {
      currentUid: string;
      phase: TurnPhase;
      activeQuestionId: string | null;
    };
    winnerUid?: string;
    players: string[];
  };
}

export async function runMatch(botA: Bot, botB: Bot): Promise<MatchMetrics> {
  const startTime = Date.now();
  const errors: string[] = [];
  let totalTurns = 0;
  let matchId = "";
  
  try {
    // 1. Bot A creates invite
    console.log(`\n🎮 Starting match: ${botA.name} vs ${botB.name}`);
    const { code } = await botA.createInvite();
    
    // 2. Bot B joins
    const joinResult = await botB.joinInvite(code);
    matchId = joinResult.matchId;
    
    // 3. Game loop
    const maxTurns = 100; // Safety limit
    
    while (totalTurns < maxTurns) {
      // Check timeout
      if (Date.now() - startTime > TEST_CONFIG.MATCH_TIMEOUT_MS) {
        errors.push("Match timeout exceeded");
        break;
      }
      
      const match = await getMatch(matchId);
      
      // Check if match ended
      if (match.status === "FINISHED" || match.status === "CANCELLED") {
        console.log(`  🏁 Match ended: status=${match.status}, winner=${match.winnerUid?.slice(0, 10) || "none"}`);
        break;
      }
      
      // Determine current player
      const currentBot = match.turn.currentUid === botA.uid ? botA : botB;
      const phase = match.turn.phase;
      
      totalTurns++;
      
      try {
        if (phase === "SPIN") {
          await currentBot.spin(matchId);
        } 
        else if (phase === "QUESTION") {
          const questionId = match.turn.activeQuestionId;
          if (!questionId) {
            errors.push("No activeQuestionId in QUESTION phase");
            break;
          }
          
          // Get correct answer from Firestore
          const question = await currentBot.getQuestion(questionId);
          const answer = currentBot.pickAnswer(question.answer);
          
          await currentBot.submitAnswer(matchId, answer);
        }
        else if (phase === "RESULT") {
          // Continue to next question or turn
          await currentBot.continueToNextQuestion(matchId);
        }
        else if (phase === "END") {
          console.log(`  🏁 Match phase=END`);
          break;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`  ❌ Error in turn ${totalTurns}: ${errMsg}`);
        errors.push(errMsg);
        
        // If it's a critical error, break
        if (errMsg.includes("not found") || errMsg.includes("Not your turn")) {
          break;
        }
      }
      
      // Small delay between turns
      await new Promise(r => setTimeout(r, 50));
    }
    
    // Get final match state
    const finalMatch = await getMatch(matchId);
    const endTime = Date.now();
    
    return {
      matchId,
      startTime,
      endTime,
      duration: endTime - startTime,
      totalTurns,
      winner: finalMatch.winnerUid || null,
      errors,
      botAUid: botA.uid,
      botBUid: botB.uid,
    };
    
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Fatal: ${errMsg}`);
    console.error(`  💀 Fatal error: ${errMsg}`);
    
    return {
      matchId: matchId || "unknown",
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
      totalTurns,
      winner: null,
      errors,
      botAUid: botA.uid,
      botBUid: botB.uid,
    };
  }
}

/**
 * Run multiple matches in parallel
 * Bot Pool kullanarak mevcut botları yeniden kullanır
 */
export async function runParallelMatches(matchCount: number): Promise<MatchMetrics[]> {
  console.log(`\n🚀 Starting ${matchCount} parallel matches (${matchCount * 2} bots)\n`);
  
  // Bot Pool'dan bot çiftlerini al (mevcut olanları yeniden kullanır)
  const { pairs, stats } = await getBotPairsForMatches(matchCount);
  console.log(`♻️  Reused: ${stats.reused}, New: ${stats.new}\n`);
  
  const allBots: Bot[] = pairs.flat();
  
  const matchPromises: Promise<MatchMetrics>[] = pairs.map(([botA, botB]) => 
    (async () => {
      await botA.init();
      await botB.init();
      return runMatch(botA, botB);
    })()
  );
  
  const results = await Promise.all(matchPromises);
  
  // Cleanup all bots
  console.log(`\n🧹 Cleaning up ${allBots.length} bots...`);
  await Promise.all(allBots.map(b => b.destroy()));
  
  return results;
}

