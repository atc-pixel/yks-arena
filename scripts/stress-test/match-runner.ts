/**
 * Match Runner - 2 botu eşleştirip maç oynatır
 * 
 * Supports two modes:
 * - Invite mode: Bot A creates invite, Bot B joins
 * - Queue mode: Bot enters queue, matches with passive bot pool
 * 
 * Flow:
 * 1. Match setup (invite or queue)
 * 2. Sırayla: SPIN → QUESTION → RESULT → ... → END
 */

import * as admin from "firebase-admin";
import { Bot } from "./bot";
import { getTestBotPairs, getTestBots } from "./test-bot-registry";
import { BOT_CONFIG, TEST_CONFIG, type MatchMetrics, type TurnPhase } from "./config";

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
    playerTypes?: Record<string, "HUMAN" | "BOT">;
  };
}

/**
 * Passive bot'un difficulty değerini queue ticket'tan oku
 */
async function getPassiveBotDifficulty(passiveBotUid: string): Promise<number> {
  const db = admin.firestore();
  const ticketSnap = await db.collection("match_queue").doc(passiveBotUid).get();
  if (ticketSnap.exists) {
    const data = ticketSnap.data();
    return data?.botDifficulty ?? 5; // default AVERAGE
  }
  return 5; // default
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
 * Run multiple matches in parallel (Invite mode)
 * Test Bot Registry kullanarak mevcut botları yeniden kullanır
 */
export async function runParallelMatches(matchCount: number): Promise<MatchMetrics[]> {
  console.log(`\n🚀 Starting ${matchCount} parallel matches (${matchCount * 2} bots)\n`);
  
  // Test Bot Registry'den bot çiftlerini al (mevcut olanları yeniden kullanır)
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
  
  // Cleanup all bots
  console.log(`\n🧹 Cleaning up ${allBots.length} bots...`);
  await Promise.all(allBots.map(b => b.destroy()));
  
  return results;
}

/**
 * Passive bot adına Admin SDK ile cevap simüle et
 * (Passive bot gerçek auth'a sahip olmadığı için direkt Firestore manipülasyonu)
 * 
 * Kurallar (gerçek submitAnswer ile aynı):
 * - Q1 doğru → RESULT phase (Q2'yi bekle)
 * - Q2 doğru → sembol kazan, SPIN phase (devam)
 * - Yanlış → sıra rakibe geçer
 */
async function simulatePassiveBotAnswer(
  matchId: string,
  passiveBotUid: string,
  passiveBotDifficulty: number,
  questionId: string
): Promise<{ isCorrect: boolean; phase: string }> {
  const db = admin.firestore();
  
  // 1. Question'ı oku
  const qSnap = await db.collection("questions").doc(questionId).get();
  if (!qSnap.exists) throw new Error(`Question ${questionId} not found`);
  
  // 2. Passive bot'un doğru cevaplama oranına göre cevap seç
  const correctRate = Bot.getPassiveBotCorrectRate(passiveBotDifficulty);
  const isCorrect = Math.random() < correctRate;
  
  // 3. Match doc'u güncelle
  const matchRef = db.collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  const match = matchSnap.data();
  
  if (!match) throw new Error("Match not found");
  
  const opponentUid = match.players.find((p: string) => p !== passiveBotUid);
  const currentState = match.stateByUid[passiveBotUid];
  const symbol = match.turn.challengeSymbol;
  const questionIndex = match.turn.questionIndex ?? 1;
  const usedIds: string[] = match.turn.usedQuestionIds || [];
  
  if (isCorrect) {
    if (questionIndex === 1) {
      // ✅ Q1 doğru → RESULT phase, Q2'yi hazırla
      // Q2 için yeni soru seç
      const questionsSnap = await db.collection("questions")
        .where("isActive", "==", true)
        .where("category", "==", symbol)
        .limit(10)
        .get();
      
      const usedSet = new Set(usedIds);
      const availableQuestions = questionsSnap.docs.filter(d => !usedSet.has(d.id));
      const nextQuestionDoc = availableQuestions[0] || questionsSnap.docs[0];
      const nextQuestionId = nextQuestionDoc?.id || questionId; // fallback
      
      await matchRef.update({
        [`stateByUid.${passiveBotUid}.answeredCount`]: (currentState.answeredCount ?? 0) + 1,
        "turn.phase": "RESULT",
        "turn.currentUid": passiveBotUid,
        "turn.activeQuestionId": questionId, // Mevcut soruyu göster (result için)
        "turn.nextQuestionId": nextQuestionId, // Q2 için hazır
        "turn.usedQuestionIds": [...usedIds, nextQuestionId],
        "turn.questionIndex": 1, // Hala Q1'deyiz, continue sonrası 2 olacak
      });
      
      console.log(`  🤖 Passive bot answered Q1 correctly → RESULT phase`);
      return { isCorrect: true, phase: "RESULT" };
      
    } else {
      // ✅ Q2 doğru → sembol kazan, SPIN phase
      const newSymbols = [...(currentState.symbols || [])];
      if (!newSymbols.includes(symbol)) {
        newSymbols.push(symbol);
      }
      
      const finished = newSymbols.length >= 4;
      await matchRef.update({
        [`stateByUid.${passiveBotUid}.symbols`]: newSymbols,
        [`stateByUid.${passiveBotUid}.answeredCount`]: (currentState.answeredCount ?? 0) + 1,
        "turn.phase": finished ? "END" : "SPIN",
        "turn.currentUid": passiveBotUid,
        "turn.activeQuestionId": null,
        "turn.nextQuestionId": null,
        "turn.challengeSymbol": null,
        "turn.questionIndex": 0,
        ...(finished ? { status: "FINISHED", winnerUid: passiveBotUid } : {}),
      });
      
      console.log(`  🤖 Passive bot answered Q2 correctly → earned ${symbol}${finished ? " 🏆 WIN!" : ""}`);
      return { isCorrect: true, phase: finished ? "END" : "SPIN" };
    }
  } else {
    // ❌ Yanlış cevap → sıra değişir
    await matchRef.update({
      [`stateByUid.${passiveBotUid}.wrongCount`]: (currentState.wrongCount ?? 0) + 1,
      [`stateByUid.${passiveBotUid}.answeredCount`]: (currentState.answeredCount ?? 0) + 1,
      "turn.phase": "SPIN",
      "turn.currentUid": opponentUid,
      "turn.activeQuestionId": null,
      "turn.nextQuestionId": null,
      "turn.challengeSymbol": null,
      "turn.questionIndex": 0,
    });
    
    console.log(`  🤖 Passive bot answered incorrectly → turn passes`);
    return { isCorrect: false, phase: "SPIN" };
  }
}

/**
 * Passive bot adına RESULT → QUESTION (Q2) geçişi simüle et
 * (continueToNextQuestion fonksiyonunun karşılığı)
 */
async function simulatePassiveBotContinue(matchId: string): Promise<{ questionId: string }> {
  const db = admin.firestore();
  const matchRef = db.collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  const match = matchSnap.data();
  
  if (!match) throw new Error("Match not found");
  
  const nextQuestionId = match.turn.nextQuestionId;
  if (!nextQuestionId) throw new Error("nextQuestionId missing in RESULT phase");
  
  await matchRef.update({
    "turn.phase": "QUESTION",
    "turn.activeQuestionId": nextQuestionId,
    "turn.nextQuestionId": null,
    "turn.questionIndex": 2, // Q2
  });
  
  console.log(`  🤖 Passive bot continues to Q2`);
  return { questionId: nextQuestionId };
}

/**
 * Passive bot adına Admin SDK ile spin simüle et
 */
async function simulatePassiveBotSpin(matchId: string, passiveBotUid: string): Promise<{ symbol: string; questionId: string }> {
  const db = admin.firestore();
  const matchRef = db.collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  const match = matchSnap.data();
  
  if (!match) throw new Error("Match not found");
  
  const currentState = match.stateByUid[passiveBotUid];
  const ownedSymbols = currentState.symbols || [];
  
  // Available symbols
  const ALL_SYMBOLS = ["BILIM", "COGRAFYA", "SPOR", "MATEMATIK"];
  const available = ALL_SYMBOLS.filter(s => !ownedSymbols.includes(s));
  
  if (available.length === 0) {
    // Tüm semboller kazanıldı
    await matchRef.update({
      status: "FINISHED",
      winnerUid: passiveBotUid,
      "turn.phase": "END",
    });
    return { symbol: "", questionId: "" };
  }
  
  const symbol = available[Math.floor(Math.random() * available.length)];
  
  // Random question seç
  const questionsSnap = await db.collection("questions")
    .where("isActive", "==", true)
    .where("category", "==", symbol)
    .limit(10)
    .get();
  
  if (questionsSnap.empty) throw new Error(`No questions for ${symbol}`);
  
  const usedIds = match.turn.usedQuestionIds || [];
  const availableQuestions = questionsSnap.docs.filter(d => !usedIds.includes(d.id));
  const questionDoc = availableQuestions[0] || questionsSnap.docs[0];
  const questionId = questionDoc.id;
  
  await matchRef.update({
    "turn.phase": "QUESTION",
    "turn.challengeSymbol": symbol,
    "turn.activeQuestionId": questionId,
    "turn.usedQuestionIds": [...usedIds, questionId],
    "turn.questionIndex": 1,
  });
  
  console.log(`  🤖 Passive bot spun: ${symbol}`);
  return { symbol, questionId };
}

/**
 * Run a single queue-based match
 * Bot enters queue and matches with passive bot pool
 */
export async function runQueueMatch(bot: Bot): Promise<MatchMetrics> {
  const startTime = Date.now();
  const errors: string[] = [];
  let totalTurns = 0;
  let matchId = "";
  let passiveBotUid = "";
  let passiveBotDifficulty = 5;
  
  try {
    // 1. Bot enters queue (forceBot=true to immediately match with passive bot)
    console.log(`\n🎮 Starting queue match: ${bot.name}`);
    const queueResult = await bot.enterQueue(true); // Force bot match
    
    if (queueResult.status !== "MATCHED" || !queueResult.matchId) {
      throw new Error(`Failed to match: status=${queueResult.status}`);
    }
    
    matchId = queueResult.matchId;
    const matchData = await getMatch(matchId);
    passiveBotUid = matchData.players.find(p => p !== bot.uid) ?? "";
    
    // Passive bot'un difficulty'sini oku
    passiveBotDifficulty = await getPassiveBotDifficulty(passiveBotUid);
    const correctRate = Bot.getPassiveBotCorrectRate(passiveBotDifficulty);
    
    console.log(`  🤖 Matched with ${queueResult.opponentType}: ${passiveBotUid.slice(0, 20)}...`);
    console.log(`  📊 Passive bot difficulty: ${passiveBotDifficulty} (${Math.round(correctRate * 100)}% accuracy)`);
    
    // 2. Random initial delay (maçları asenkron yapar, race condition azaltır)
    const initialDelay = Math.floor(Math.random() * BOT_CONFIG.INITIAL_DELAY_MAX_MS);
    if (initialDelay > 0) {
      console.log(`  ⏳ Waiting ${initialDelay}ms before first move...`);
      await new Promise(r => setTimeout(r, initialDelay));
    }
    
    // 3. Game loop
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
          } else {
            // Passive bot'un sırası - Admin SDK ile simüle et
            await simulatePassiveBotSpin(matchId, passiveBotUid);
          }
        } 
        else if (phase === "QUESTION") {
          const questionId = match.turn.activeQuestionId;
          if (!questionId) {
            errors.push("No activeQuestionId in QUESTION phase");
            break;
          }
          
          if (isOurTurn) {
            // Test bot'un sırası - normal oyna
            const question = await bot.getQuestion(questionId);
            const answer = bot.pickAnswer(question.answer);
            await bot.submitAnswer(matchId, answer);
          } else {
            // Passive bot'un sırası - Admin SDK ile simüle et
            await simulatePassiveBotAnswer(matchId, passiveBotUid, passiveBotDifficulty, questionId);
          }
        }
        else if (phase === "RESULT") {
          if (isOurTurn) {
            await bot.continueToNextQuestion(matchId);
          } else {
            // Passive bot RESULT phase'inde - Q2'ye geç
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
        
        // Critical errors - break immediately
        if (errMsg.includes("not found") || 
            errMsg.includes("Not your turn") ||
            errMsg.includes("ENERGY_ZERO")) {
          console.log(`  ⛔ Critical error, ending match`);
          break;
        }
      }
      
      await new Promise(r => setTimeout(r, 100));
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
      botBUid: passiveBotUid,
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
      botBUid: passiveBotUid || "unknown",
    };
  }
}

/**
 * Run multiple queue-based matches in parallel
 * Each bot matches with passive bot pool
 * 
 * Random initial delay ile maçlar asenkron başlar, race condition azalır
 */
export async function runParallelQueueMatches(matchCount: number): Promise<MatchMetrics[]> {
  console.log(`\n🚀 Starting ${matchCount} queue-based matches (parallel)\n`);
  
  const { bots, reusedCount, newCount } = await getTestBots(matchCount);
  console.log(`♻️  Reused: ${reusedCount}, New: ${newCount}\n`);
  
  // Initialize all bots first
  console.log(`🔧 Initializing ${bots.length} bots...`);
  await Promise.all(bots.map(b => b.init()));
  
  // Run all matches in parallel (random initial delay will stagger them)
  console.log(`\n🎮 Starting all matches...`);
  const results = await Promise.all(
    bots.map(bot => runQueueMatch(bot))
  );
  
  console.log(`\n🧹 Cleaning up ${bots.length} bots...`);
  await Promise.all(bots.map(b => b.destroy()));
  
  return results;
}

