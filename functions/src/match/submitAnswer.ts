import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "../utils/firestore";
import type { SymbolKey, ChoiceKey, MatchDoc, QuestionDoc } from "../shared/types";
import type { UserDoc } from "../users/types";
import { ensureUserDoc } from "../users/ensure";
import { applyHourlyRefillTx } from "../users/energy";
import { SubmitAnswerInputSchema, strictParse } from "../shared/validation";

const RANDOM_ID_MAX = 10_000_000;

function randInt(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}

// deterministic hash (retry-safe)
function hashStringToInt(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Elo yokken deterministic 0..5 kupa.
 * Retry olursa değişmesin diye Math.random yok.
 */
function calcKupaForCorrectAnswer(params: { matchId: string; questionId: string; uid: string }) {
  const seed = hashStringToInt(`${params.matchId}:${params.questionId}:${params.uid}`);
  return seed % 6; // 0..5
}

/**
 * RandomId inequality pick inside TX, avoiding used IDs.
 */
async function pickRandomQuestionIdTx(params: {
  tx: FirebaseFirestore.Transaction;
  category: string;
  used: Set<string>;
  maxAttempts?: number;
}): Promise<string> {
  // #region agent log
  const log = (msg: string, data: any, hypothesisId?: string) => {
    fetch('http://127.0.0.1:7242/ingest/36a93515-5c69-4ba7-b207-97735e7b3a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'submitAnswer.ts:pickRandomQuestionIdTx',message:msg,data:data,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:hypothesisId||'H1'})}).catch(()=>{});
  };
  log('pickRandomQuestionIdTx:ENTRY', { category: params.category, usedCount: params.used.size, maxAttempts: params.maxAttempts }, 'H1');
  // #endregion

  const { tx, category, used, maxAttempts = 14 } = params;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const r = randInt(RANDOM_ID_MAX);
    // #region agent log
    log('pickRandomQuestionIdTx:ATTEMPT', { attempt, randomVal: r, category }, 'H1');
    // #endregion

    let q = db
      .collection("questions")
      .where("isActive", "==", true)
      .where("category", "==", category)
      .where("randomId", ">=", r)
      .orderBy("randomId", "asc")
      .limit(1);

    // #region agent log
    log('pickRandomQuestionIdTx:BEFORE_QUERY_ASC', { category, randomId: r }, 'H1');
    // #endregion
    let snap;
    try {
      snap = await tx.get(q);
      // #region agent log
      log('pickRandomQuestionIdTx:AFTER_QUERY_ASC', { empty: snap.empty, size: snap.size, attempt }, 'H1');
      // #endregion
    } catch (queryError: any) {
      // #region agent log
      log('pickRandomQuestionIdTx:QUERY_ERROR_ASC', { 
        error: queryError?.message || String(queryError),
        code: queryError?.code,
        category,
        randomId: r
      }, 'H1');
      // #endregion
      throw queryError;
    }

    if (snap.empty) {
      q = db
        .collection("questions")
        .where("isActive", "==", true)
        .where("category", "==", category)
        .where("randomId", "<", r)
        .orderBy("randomId", "desc")
        .limit(1);

      // #region agent log
      log('pickRandomQuestionIdTx:BEFORE_QUERY_DESC', { category, randomId: r }, 'H1');
      // #endregion
      try {
        snap = await tx.get(q);
        // #region agent log
        log('pickRandomQuestionIdTx:AFTER_QUERY_DESC', { empty: snap.empty, size: snap.size, attempt }, 'H1');
        // #endregion
      } catch (queryError: any) {
        // #region agent log
        log('pickRandomQuestionIdTx:QUERY_ERROR_DESC', { 
          error: queryError?.message || String(queryError),
          code: queryError?.code,
          category,
          randomId: r
        }, 'H1');
        // #endregion
        throw queryError;
      }
    }

    if (snap.empty) {
      // #region agent log
      log('pickRandomQuestionIdTx:EMPTY_SNAP', { attempt, category }, 'H1');
      // #endregion
      continue;
    }

    const id = snap.docs[0].id;
    // #region agent log
    log('pickRandomQuestionIdTx:FOUND_QUESTION', { id, used: used.has(id), attempt }, 'H1');
    // #endregion
    if (!used.has(id)) return id;
  }

  throw new HttpsError(
    "resource-exhausted",
    `No unused questions available for category "${category}" (randomId retries exhausted).`
  );
}

export const matchSubmitAnswer = onCall(
  { region: "europe-west1" },
  async (req) => {
  // #region agent log
  const log = (msg: string, data: any, hypothesisId?: string) => {
    fetch('http://127.0.0.1:7242/ingest/36a93515-5c69-4ba7-b207-97735e7b3a32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'submitAnswer.ts',message:msg,data:data,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:hypothesisId||'H1'})}).catch(()=>{});
  };
  log('matchSubmitAnswer:ENTRY', { uid: req.auth?.uid, hasData: !!req.data }, 'H1');
  // #endregion

  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  // Zod validation
  let validatedInput;
  try {
    validatedInput = strictParse(SubmitAnswerInputSchema, req.data, "matchSubmitAnswer");
    // #region agent log
    log('matchSubmitAnswer:VALIDATED', { matchId: validatedInput.matchId, answer: validatedInput.answer }, 'H1');
    // #endregion
  } catch (error) {
    // #region agent log
    log('matchSubmitAnswer:VALIDATION_ERROR', { error: error instanceof Error ? error.message : String(error) }, 'H1');
    // #endregion
    throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid input");
  }

  // Safety net (ragequit / ensureUserProfile missed)
  await ensureUserDoc(uid);

  const matchId = validatedInput.matchId;
  const answer = validatedInput.answer;

  const matchRef = db.collection("matches").doc(matchId);

  const result = await db.runTransaction(async (tx) => {
    // #region agent log
    log('matchSubmitAnswer:TX_START', { matchId }, 'H1');
    // #endregion
    const matchSnap = await tx.get(matchRef);
    // #region agent log
    log('matchSubmitAnswer:MATCH_READ', { exists: matchSnap.exists, matchId }, 'H1');
    // #endregion
    if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found");

    // Read user energy (GLOBAL wrong allowance)
    const userRef = db.collection("users").doc(uid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError("internal", "User doc missing");

    const userData = userSnap.data() as UserDoc | undefined;
    if (!userData) throw new HttpsError("internal", "User data is invalid");
    const nowMs = Date.now();
    const { energyAfter: currentEnergy } = applyHourlyRefillTx({
      tx,
      userRef,
      userData,
      nowMs,
    });

    // Rule: energy 0 => cannot answer any question
    if (currentEnergy <= 0) {
      throw new HttpsError("failed-precondition", "ENERGY_ZERO");
    }

    const match = matchSnap.data() as MatchDoc | undefined;
    if (!match) throw new HttpsError("internal", "Match data is invalid");

    if (match.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Match not active");
    if (match.turn?.phase !== "QUESTION") throw new HttpsError("failed-precondition", "Not in QUESTION phase");
    if (match.turn?.currentUid !== uid) throw new HttpsError("failed-precondition", "Not your turn");

    const questionId: string | null = match.turn?.activeQuestionId ?? null;
    const symbol: SymbolKey | null = match.turn?.challengeSymbol ?? null;
    const questionIndex: number = Number(match.turn?.questionIndex ?? 0);

    if (!questionId) throw new HttpsError("internal", "activeQuestionId missing");
    if (!symbol) throw new HttpsError("internal", "challengeSymbol missing");
    if (questionIndex !== 1 && questionIndex !== 2) {
      throw new HttpsError("failed-precondition", "Invalid questionIndex (expected 1 or 2)");
    }

    const players: string[] = match.players ?? [];
    if (!Array.isArray(players) || players.length !== 2) {
      throw new HttpsError("failed-precondition", "Match requires exactly 2 players");
    }
    const oppUid = players.find((p) => p !== uid);
    if (!oppUid) throw new HttpsError("internal", "Opponent not found");

    const myState = match.stateByUid?.[uid];
    if (!myState) throw new HttpsError("internal", "Player state missing");

    // Read question
    const qRef = db.collection("questions").doc(questionId);
    // #region agent log
    log('matchSubmitAnswer:BEFORE_QUESTION_READ', { questionId, symbol }, 'H2');
    // #endregion
    const qSnap = await tx.get(qRef);
    // #region agent log
    log('matchSubmitAnswer:AFTER_QUESTION_READ', { exists: qSnap.exists, questionId }, 'H2');
    // #endregion
    if (!qSnap.exists) throw new HttpsError("failed-precondition", "Question doc missing");

    const q = qSnap.data() as QuestionDoc | undefined;
    // #region agent log
    log('matchSubmitAnswer:QUESTION_DATA', { 
      hasQ: !!q, 
      category: q?.category, 
      hasAnswer: 'answer' in (q || {}),
      answerType: typeof q?.answer,
      answerValue: q?.answer,
      allFields: q ? Object.keys(q) : []
    }, 'H2');
    // #endregion
    if (!q) throw new HttpsError("internal", "Question data is invalid");
    const correctAnswer: ChoiceKey = q.answer;
    const isCorrect = answer === correctAnswer;
    // #region agent log
    log('matchSubmitAnswer:ANSWER_COMPARISON', { correctAnswer, userAnswer: answer, isCorrect }, 'H2');
    // #endregion

    const kupaAwarded = isCorrect ? calcKupaForCorrectAnswer({ matchId, questionId, uid }) : 0;

    const nextMyState = { ...myState };
    nextMyState.answeredCount = (nextMyState.answeredCount ?? 0) + 1;

    let earnedSymbol: SymbolKey | null = null;

    // used set
    const usedArr: string[] = match.turn?.usedQuestionIds ?? [];
    const usedSet = new Set<string>(usedArr);

    // base turn result (UI feedback)
    const baseResult = {
      uid,
      questionId,
      symbol,
      answer,
      correctAnswer,
      isCorrect,
      kupaAwarded,
      earnedSymbol: null as SymbolKey | null,
      at: Date.now(),
      questionIndex,
    };

    // WRONG => consume 1 energy; if reaches 0 => match ends (opponent wins)
    if (!isCorrect) {
      nextMyState.wrongCount = (nextMyState.wrongCount ?? 0) + 1;

      const energyAfter = Math.max(0, currentEnergy - 1);

      // consume energy (global)
      // consume energy (global) - MUST be inside TX
      tx.update(userRef, { "economy.energy": FieldValue.increment(-1) });

      

      // energy remains >0 => pass turn
      tx.update(matchRef, {
        [`stateByUid.${uid}`]: nextMyState,

        "turn.lastResult": baseResult,
        "turn.phase": "SPIN",
        "turn.currentUid": oppUid, // ✅ pass
        "turn.activeQuestionId": null,

        // chain reset
        "turn.challengeSymbol": null,
        "turn.questionIndex": 0,
      });

      return {
        matchId,
        status: "ACTIVE",
        phase: "SPIN",
        isCorrect: false,
        nextCurrentUid: oppUid,
        questionIndex: 0,
        kupaAwarded: 0,
        energyAfter,
      };
    }

    // CORRECT => add match kupa (question-based)
    nextMyState.trophies = (nextMyState.trophies ?? 0) + kupaAwarded;

    // If Q1 correct => show result, prepare Q2 but wait for user to continue
    if (questionIndex === 1) {
      // #region agent log
      log('matchSubmitAnswer:BEFORE_PICK_Q2', { symbol, usedCount: usedSet.size, questionIndex }, 'H1');
      // #endregion
      const nextQuestionId = await pickRandomQuestionIdTx({
        tx,
        category: symbol,
        used: usedSet,
        maxAttempts: 14,
      });
      // #region agent log
      log('matchSubmitAnswer:AFTER_PICK_Q2', { nextQuestionId, symbol }, 'H1');
      // #endregion

      tx.update(matchRef, {
        [`stateByUid.${uid}`]: nextMyState,

        "turn.lastResult": baseResult,
        "turn.phase": "RESULT", // ✅ Show result, wait for continue
        "turn.currentUid": uid, // ✅ stay
        "turn.challengeSymbol": symbol, // ✅ same category
        "turn.activeQuestionId": questionId, // ✅ Keep current question ID (so UI shows result)
        "turn.nextQuestionId": nextQuestionId, // ✅ Store Q2 for when user continues
        "turn.usedQuestionIds": [...usedArr, nextQuestionId],
        "turn.questionIndex": 1, // ✅ Still on Q1 (will become 2 after continue)
      });

      return {
        matchId,
        status: "ACTIVE",
        phase: "RESULT",
        isCorrect: true,
        nextCurrentUid: uid,
        questionIndex: 1,
        symbol,
        questionId: questionId, // Current question (for result display)
        nextQuestionId: nextQuestionId, // Next question (will be shown after continue)
        kupaAwarded,
        energyAfter: currentEnergy,
      };
    }

    // If Q2 correct => earn symbol, back to SPIN (still your turn)
    const owned: SymbolKey[] = (nextMyState.symbols ?? []) as SymbolKey[];
    if (!owned.includes(symbol)) {
      nextMyState.symbols = [...owned, symbol];
      earnedSymbol = symbol;
    }

    const symbolsCount = ((nextMyState.symbols ?? []) as SymbolKey[]).length;
    const finished = symbolsCount >= 4;

    const finalResult = { ...baseResult, earnedSymbol };

    tx.update(matchRef, {
      [`stateByUid.${uid}`]: nextMyState,

      "turn.lastResult": finalResult,

      status: finished ? "FINISHED" : "ACTIVE",
      ...(finished ? { winnerUid: uid, endedReason: "ALL_SYMBOLS_OWNED" } : {}),

      "turn.phase": finished ? "END" : "SPIN",
      "turn.currentUid": uid, // ✅ still you (keep going)
      "turn.activeQuestionId": null,

      // chain reset
      "turn.challengeSymbol": null,
      "turn.questionIndex": 0,
    });

    return {
      matchId,
      status: finished ? "FINISHED" : "ACTIVE",
      phase: finished ? "END" : "SPIN",
      isCorrect: true,
      earnedSymbol,
      nextCurrentUid: uid,
      questionIndex: 0,
      kupaAwarded,
      energyAfter: currentEnergy,
    };
  });

  // #region agent log
  log('matchSubmitAnswer:SUCCESS', { matchId, result: 'completed' }, 'H1');
  // #endregion
  return result;
});
