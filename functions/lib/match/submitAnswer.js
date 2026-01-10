"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchSubmitAnswer = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const ensure_1 = require("../users/ensure");
const energy_1 = require("../users/energy");
const validation_1 = require("../shared/validation");
const RANDOM_ID_MAX = 10_000_000;
function randInt(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
}
// deterministic hash (retry-safe)
function hashStringToInt(input) {
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
function calcKupaForCorrectAnswer(params) {
    const seed = hashStringToInt(`${params.matchId}:${params.questionId}:${params.uid}`);
    return seed % 6; // 0..5
}
/**
 * RandomId inequality pick inside TX, avoiding used IDs.
 */
async function pickRandomQuestionIdTx(params) {
    // #region agent log
    const log = (msg, data, hypothesisId) => {
        fetch('http://127.0.0.1:7242/ingest/36a93515-5c69-4ba7-b207-97735e7b3a32', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'submitAnswer.ts:pickRandomQuestionIdTx', message: msg, data: data, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: hypothesisId || 'H1' }) }).catch(() => { });
    };
    log('pickRandomQuestionIdTx:ENTRY', { category: params.category, usedCount: params.used.size, maxAttempts: params.maxAttempts }, 'H1');
    // #endregion
    const { tx, category, used, maxAttempts = 14 } = params;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const r = randInt(RANDOM_ID_MAX);
        // #region agent log
        log('pickRandomQuestionIdTx:ATTEMPT', { attempt, randomVal: r, category }, 'H1');
        // #endregion
        let q = firestore_1.db
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
        }
        catch (queryError) {
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
            q = firestore_1.db
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
            }
            catch (queryError) {
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
        if (!used.has(id))
            return id;
    }
    throw new https_1.HttpsError("resource-exhausted", `No unused questions available for category "${category}" (randomId retries exhausted).`);
}
exports.matchSubmitAnswer = (0, https_1.onCall)({ region: "europe-west1" }, async (req) => {
    // #region agent log
    const log = (msg, data, hypothesisId) => {
        fetch('http://127.0.0.1:7242/ingest/36a93515-5c69-4ba7-b207-97735e7b3a32', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'submitAnswer.ts', message: msg, data: data, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: hypothesisId || 'H1' }) }).catch(() => { });
    };
    log('matchSubmitAnswer:ENTRY', { uid: req.auth?.uid, hasData: !!req.data }, 'H1');
    // #endregion
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    // Zod validation
    let validatedInput;
    try {
        validatedInput = (0, validation_1.strictParse)(validation_1.SubmitAnswerInputSchema, req.data, "matchSubmitAnswer");
        // #region agent log
        log('matchSubmitAnswer:VALIDATED', { matchId: validatedInput.matchId, answer: validatedInput.answer }, 'H1');
        // #endregion
    }
    catch (error) {
        // #region agent log
        log('matchSubmitAnswer:VALIDATION_ERROR', { error: error instanceof Error ? error.message : String(error) }, 'H1');
        // #endregion
        throw new https_1.HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid input");
    }
    // Safety net (ragequit / ensureUserProfile missed)
    await (0, ensure_1.ensureUserDoc)(uid);
    const matchId = validatedInput.matchId;
    const answer = validatedInput.answer;
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const result = await firestore_1.db.runTransaction(async (tx) => {
        // #region agent log
        log('matchSubmitAnswer:TX_START', { matchId }, 'H1');
        // #endregion
        const matchSnap = await tx.get(matchRef);
        // #region agent log
        log('matchSubmitAnswer:MATCH_READ', { exists: matchSnap.exists, matchId }, 'H1');
        // #endregion
        if (!matchSnap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        // Read user energy (GLOBAL wrong allowance)
        const userRef = firestore_1.db.collection("users").doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists)
            throw new https_1.HttpsError("internal", "User doc missing");
        const userData = userSnap.data();
        if (!userData)
            throw new https_1.HttpsError("internal", "User data is invalid");
        const nowMs = Date.now();
        const { energyAfter: currentEnergy } = (0, energy_1.applyHourlyRefillTx)({
            tx,
            userRef,
            userData,
            nowMs,
        });
        // Rule: energy 0 => cannot answer any question
        if (currentEnergy <= 0) {
            throw new https_1.HttpsError("failed-precondition", "ENERGY_ZERO");
        }
        const match = matchSnap.data();
        if (!match)
            throw new https_1.HttpsError("internal", "Match data is invalid");
        if (match.status !== "ACTIVE")
            throw new https_1.HttpsError("failed-precondition", "Match not active");
        if (match.turn?.phase !== "QUESTION")
            throw new https_1.HttpsError("failed-precondition", "Not in QUESTION phase");
        if (match.turn?.currentUid !== uid)
            throw new https_1.HttpsError("failed-precondition", "Not your turn");
        const questionId = match.turn?.activeQuestionId ?? null;
        const symbol = match.turn?.challengeSymbol ?? null;
        const questionIndex = Number(match.turn?.questionIndex ?? 0);
        if (!questionId)
            throw new https_1.HttpsError("internal", "activeQuestionId missing");
        if (!symbol)
            throw new https_1.HttpsError("internal", "challengeSymbol missing");
        if (questionIndex !== 1 && questionIndex !== 2) {
            throw new https_1.HttpsError("failed-precondition", "Invalid questionIndex (expected 1 or 2)");
        }
        const players = match.players ?? [];
        if (!Array.isArray(players) || players.length !== 2) {
            throw new https_1.HttpsError("failed-precondition", "Match requires exactly 2 players");
        }
        const oppUid = players.find((p) => p !== uid);
        if (!oppUid)
            throw new https_1.HttpsError("internal", "Opponent not found");
        const myState = match.stateByUid?.[uid];
        if (!myState)
            throw new https_1.HttpsError("internal", "Player state missing");
        // Read question
        const qRef = firestore_1.db.collection("questions").doc(questionId);
        // #region agent log
        log('matchSubmitAnswer:BEFORE_QUESTION_READ', { questionId, symbol }, 'H2');
        // #endregion
        const qSnap = await tx.get(qRef);
        // #region agent log
        log('matchSubmitAnswer:AFTER_QUESTION_READ', { exists: qSnap.exists, questionId }, 'H2');
        // #endregion
        if (!qSnap.exists)
            throw new https_1.HttpsError("failed-precondition", "Question doc missing");
        const q = qSnap.data();
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
        if (!q)
            throw new https_1.HttpsError("internal", "Question data is invalid");
        const correctAnswer = q.answer;
        const isCorrect = answer === correctAnswer;
        // #region agent log
        log('matchSubmitAnswer:ANSWER_COMPARISON', { correctAnswer, userAnswer: answer, isCorrect }, 'H2');
        // #endregion
        const kupaAwarded = isCorrect ? calcKupaForCorrectAnswer({ matchId, questionId, uid }) : 0;
        const nextMyState = { ...myState };
        nextMyState.answeredCount = (nextMyState.answeredCount ?? 0) + 1;
        let earnedSymbol = null;
        // used set
        const usedArr = match.turn?.usedQuestionIds ?? [];
        const usedSet = new Set(usedArr);
        // base turn result (UI feedback)
        const baseResult = {
            uid,
            questionId,
            symbol,
            answer,
            correctAnswer,
            isCorrect,
            kupaAwarded,
            earnedSymbol: null,
            at: Date.now(),
            questionIndex,
        };
        // WRONG => consume 1 energy; if reaches 0 => match ends (opponent wins)
        if (!isCorrect) {
            nextMyState.wrongCount = (nextMyState.wrongCount ?? 0) + 1;
            const energyAfter = Math.max(0, currentEnergy - 1);
            // consume energy (global)
            // consume energy (global) - MUST be inside TX
            tx.update(userRef, { "economy.energy": firestore_1.FieldValue.increment(-1) });
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
        const owned = (nextMyState.symbols ?? []);
        if (!owned.includes(symbol)) {
            nextMyState.symbols = [...owned, symbol];
            earnedSymbol = symbol;
        }
        const symbolsCount = (nextMyState.symbols ?? []).length;
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
