/**
 * Match Runner - Test botlarını eşleştirip maç oynatır
 * 
 * Yeni mimari:
 * - Test botları birbirleriyle eşleşebilir (match_queue)
 * - 15 saniye sonra passive botlar dahil edilir (bot_pool)
 * - forceBot yok - backend otomatik yönetiyor
 * 
 * Modes:
 * - Invite mode: Bot A creates invite, Bot B joins
 * - Queue mode: Botlar queue'ya girer, birbirleriyle veya passive botlarla eşleşir
 */

import * as admin from "firebase-admin";
import { Bot } from "./bot";
import { getTestBotPairs, getTestBots } from "./test-bot-registry";
import { TEST_CONFIG, getQueueDelay, type MatchMetrics, type TurnPhase } from "./config";
import {
  getPassiveBotDifficulty,
  simulatePassiveBotSpin,
  simulatePassiveBotAnswer,
  simulatePassiveBotContinue,
} from "./passive-bot-simulator";

// ============================================================================
// TYPES
// ============================================================================

type MatchData = {
  status: string;
  turn: {
    currentUid: string;
    phase: TurnPhase;
    activeQuestionId: string | null;
  };
  winnerUid?: string;
  players: string[];
  playerTypes?: Record<string, "HUMAN" | "BOT">;
};

// ============================================================================
// HELPERS
// ============================================================================

async function getMatch(matchId: string): Promise<MatchData> {
  const db = admin.firestore();
  const snap = await db.collection("matches").doc(matchId).get();
  if (!snap.exists) throw new Error(`Match ${matchId} not found`);
  return snap.data() as MatchData;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// INVITE MODE (unchanged)
// ============================================================================

export async function runMatch(botA: Bot, botB: Bot): Promise<MatchMetrics> {
  const startTime = Date.now();
  const errors: string[] = [];
  let totalTurns = 0;
  let matchId = "";
  
  try {
    console.log(`\n🎮 Starting match: ${botA.name} vs ${botB.name}`);
    const { code } = await botA.createInvite();
    const joinResult = await botB.joinInvite(code);
    matchId = joinResult.matchId;
    
    const maxTurns = 100;
    
    while (totalTurns < maxTurns) {
      if (Date.now() - startTime > TEST_CONFIG.MATCH_TIMEOUT_MS) {
        errors.push("Match timeout exceeded");
        break;
      }
      
      const match = await getMatch(matchId);
      
      if (match.status === "FINISHED" || match.status === "CANCELLED") {
        console.log(`  🏁 Match ended: status=${match.status}, winner=${match.winnerUid?.slice(0, 10) || "none"}`);
        break;
      }
      
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
          
          const question = await currentBot.getQuestion(questionId);
          const answer = currentBot.pickAnswer(question.answer);
          await currentBot.submitAnswer(matchId, answer);
        }
        else if (phase === "RESULT") {
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
        
        if (errMsg.includes("not found") || errMsg.includes("Not your turn")) {
          break;
        }
      }
      
      await delay(50);
    }
    
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

export async function runParallelMatches(matchCount: number): Promise<MatchMetrics[]> {
  console.log(`\n🚀 Starting ${matchCount} parallel matches (${matchCount * 2} bots)\n`);
  
  const { pairs, stats } = await getTestBotPairs(matchCount);
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
  
  console.log(`\n🧹 Cleaning up ${allBots.length} bots...`);
  await Promise.all(allBots.map(b => b.destroy()));
  
  return results;
}

// ============================================================================
// QUEUE MODE (yeni mimari)
// ============================================================================

/**
 * Run a single queue-based match
 * 
 * Yeni akış:
 * 1. enterQueue() çağır
 * 2. MATCHED → maç başlar (rakip test bot veya passive bot olabilir)
 * 3. QUEUED → polling ile bekle, 15s sonra bot dahil edilir
 */
export async function runQueueMatch(bot: Bot): Promise<MatchMetrics> {
  const startTime = Date.now();
  const errors: string[] = [];
  let totalTurns = 0;
  let matchId = "";
  let opponentUid = "";
  let opponentIsPassiveBot = false;
  let passiveBotDifficulty = 5;
  
  try {
    console.log(`\n🎮 Starting queue match: ${bot.name}`);
    
    // Staggered start: 0-3s random bekleme
    const queueDelay = getQueueDelay();
    if (queueDelay > 0) {
      console.log(`  ⏳ Waiting ${queueDelay}ms before entering queue...`);
      await delay(queueDelay);
    }
    
    // Polling ile eşleşme bekle
    let queueResult = await bot.enterQueue();
    let pollCount = 0;
    const maxPolls = Math.ceil((TEST_CONFIG.BOT_INCLUSION_SECONDS + 10) * 1000 / TEST_CONFIG.QUEUE_POLL_INTERVAL_MS);
    
    while (queueResult.status === "QUEUED" && pollCount < maxPolls) {
      pollCount++;
      const waitSeconds = queueResult.waitSeconds ?? pollCount * (TEST_CONFIG.QUEUE_POLL_INTERVAL_MS / 1000);
      console.log(`  ⏳ ${bot.name} still in queue (${waitSeconds.toFixed(0)}s)...`);
      
      await delay(TEST_CONFIG.QUEUE_POLL_INTERVAL_MS);
      queueResult = await bot.enterQueue();
    }
    
    if (queueResult.status !== "MATCHED" || !queueResult.matchId) {
      throw new Error(`Failed to match after ${pollCount} polls: status=${queueResult.status}`);
    }
    
    matchId = queueResult.matchId;
    const matchData = await getMatch(matchId);
    opponentUid = matchData.players.find(p => p !== bot.uid) ?? "";
    
    // Rakip passive bot mu (bot_pool'dan) yoksa test bot mu?
    const opponentType = matchData.playerTypes?.[opponentUid];
    opponentIsPassiveBot = opponentType === "BOT" && opponentUid.startsWith("bot_passive_");
    
    if (opponentIsPassiveBot) {
      passiveBotDifficulty = await getPassiveBotDifficulty(opponentUid);
      const correctRate = Bot.getPassiveBotCorrectRate(passiveBotDifficulty);
      console.log(`  🤖 Matched with PASSIVE BOT: ${opponentUid.slice(0, 20)}...`);
      console.log(`  📊 Difficulty: ${passiveBotDifficulty} (${Math.round(correctRate * 100)}% accuracy)`);
    } else {
      console.log(`  👤 Matched with TEST BOT: ${opponentUid.slice(0, 20)}...`);
    }
    
    // Game loop
    const maxTurns = 100;
    
    while (totalTurns < maxTurns) {
      if (Date.now() - startTime > TEST_CONFIG.MATCH_TIMEOUT_MS) {
        errors.push("Match timeout exceeded");
        break;
      }
      
      const match = await getMatch(matchId);
      
      if (match.status === "FINISHED" || match.status === "CANCELLED") {
        console.log(`  🏁 Match ended: status=${match.status}, winner=${match.winnerUid?.slice(0, 10) || "none"}`);
        break;
      }
      
      const currentUid = match.turn.currentUid;
      const phase = match.turn.phase;
      const isOurTurn = currentUid === bot.uid;
      
      totalTurns++;
      
      try {
        if (phase === "SPIN") {
          if (isOurTurn) {
            await bot.spin(matchId);
          } else if (opponentIsPassiveBot) {
            // Passive bot'un sırası - Admin SDK ile simüle et
            await simulatePassiveBotSpin(matchId, opponentUid);
          }
          // Test bot rakibinin sırası ise → o bot kendi işlemini yapacak
        } 
        else if (phase === "QUESTION") {
          const questionId = match.turn.activeQuestionId;
          if (!questionId) {
            errors.push("No activeQuestionId in QUESTION phase");
            break;
          }
          
          if (isOurTurn) {
            const question = await bot.getQuestion(questionId);
            const answer = bot.pickAnswer(question.answer);
            await bot.submitAnswer(matchId, answer);
          } else if (opponentIsPassiveBot) {
            await simulatePassiveBotAnswer(matchId, opponentUid, passiveBotDifficulty, questionId);
          }
        }
        else if (phase === "RESULT") {
          if (isOurTurn) {
            await bot.continueToNextQuestion(matchId);
          } else if (opponentIsPassiveBot) {
            await simulatePassiveBotContinue(matchId);
          }
        }
        else if (phase === "END") {
          console.log(`  🏁 Match phase=END`);
          break;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`  ❌ Error in turn ${totalTurns}: ${errMsg}`);
        errors.push(errMsg);
        
        if (errMsg.includes("not found") || 
            errMsg.includes("Not your turn") ||
            errMsg.includes("ENERGY_ZERO")) {
          console.log(`  ⛔ Critical error, ending match`);
          break;
        }
      }
      
      await delay(100);
    }
    
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
      botAUid: bot.uid,
      botBUid: opponentUid,
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
      botAUid: bot.uid,
      botBUid: opponentUid || "unknown",
    };
  }
}

/**
 * Run multiple queue-based matches
 * 
 * Botlar birbirleriyle veya passive botlarla eşleşir.
 * Staggered start ile contention azaltılır.
 */
export async function runParallelQueueMatches(matchCount: number): Promise<MatchMetrics[]> {
  console.log(`\n🚀 Starting ${matchCount} queue-based matches\n`);
  
  const { bots, reusedCount, newCount } = await getTestBots(matchCount);
  console.log(`♻️  Reused: ${reusedCount}, New: ${newCount}\n`);
  
  // Initialize all bots first
  console.log(`🔧 Initializing ${bots.length} bots...`);
  await Promise.all(bots.map(b => b.init()));
  
  // Run all matches (staggered start içeride)
  console.log(`\n🎮 Starting all matches (staggered)...`);
  const results = await Promise.all(
    bots.map(bot => runQueueMatch(bot))
  );
  
  console.log(`\n🧹 Cleaning up ${bots.length} bots...`);
  await Promise.all(bots.map(b => b.destroy()));
  
  return results;
}
