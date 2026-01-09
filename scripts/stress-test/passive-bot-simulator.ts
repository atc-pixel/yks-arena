/**
 * Passive Bot Simulator
 * 
 * Admin SDK ile passive bot adına hamle simülasyonu yapar.
 * Passive bot gerçek auth'a sahip olmadığı için direkt Firestore manipülasyonu gerekir.
 * 
 * Architecture Decision:
 * - match-runner.ts'den ayrıldı (200+ satır kuralı)
 * - Tüm passive bot simülasyon logic'i burada
 */

import * as admin from "firebase-admin";
import { Bot } from "./bot";
import type { TurnPhase } from "./config";

// ============================================================================
// TYPES
// ============================================================================

type MatchData = {
  status: string;
  turn: {
    currentUid: string;
    phase: TurnPhase;
    activeQuestionId: string | null;
    challengeSymbol: string | null;
    usedQuestionIds: string[];
    questionIndex?: number;
    nextQuestionId?: string | null;
  };
  winnerUid?: string;
  players: string[];
  stateByUid: Record<string, {
    symbols: string[];
    answeredCount: number;
    wrongCount: number;
  }>;
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Passive bot'un difficulty değerini bot_pool'dan oku
 */
export async function getPassiveBotDifficulty(passiveBotUid: string): Promise<number> {
  const db = admin.firestore();
  
  // Önce bot_pool'da ara (yeni mimari)
  const poolSnap = await db.collection("bot_pool").doc(passiveBotUid).get();
  if (poolSnap.exists) {
    const data = poolSnap.data();
    return data?.botDifficulty ?? 5;
  }
  
  // Fallback: match_queue'da ara (eski mimari uyumluluğu)
  const queueSnap = await db.collection("match_queue").doc(passiveBotUid).get();
  if (queueSnap.exists) {
    const data = queueSnap.data();
    return data?.botDifficulty ?? 5;
  }
  
  return 5; // default AVERAGE
}

// ============================================================================
// SPIN SIMULATION
// ============================================================================

/**
 * Passive bot adına Admin SDK ile spin simüle et
 */
export async function simulatePassiveBotSpin(
  matchId: string,
  passiveBotUid: string
): Promise<{ symbol: string; questionId: string }> {
  const db = admin.firestore();
  const matchRef = db.collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  const match = matchSnap.data() as MatchData | undefined;
  
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

// ============================================================================
// ANSWER SIMULATION
// ============================================================================

/**
 * Passive bot adına Admin SDK ile cevap simüle et
 * 
 * Kurallar (gerçek submitAnswer ile aynı):
 * - Q1 doğru → RESULT phase (Q2'yi bekle)
 * - Q2 doğru → sembol kazan, SPIN phase (devam)
 * - Yanlış → sıra rakibe geçer
 */
export async function simulatePassiveBotAnswer(
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
  const match = matchSnap.data() as MatchData | undefined;
  
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
      if (symbol && !newSymbols.includes(symbol)) {
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

// ============================================================================
// CONTINUE SIMULATION
// ============================================================================

/**
 * Passive bot adına RESULT → QUESTION (Q2) geçişi simüle et
 * (continueToNextQuestion fonksiyonunun karşılığı)
 */
export async function simulatePassiveBotContinue(matchId: string): Promise<{ questionId: string }> {
  const db = admin.firestore();
  const matchRef = db.collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  const match = matchSnap.data() as MatchData | undefined;
  
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

