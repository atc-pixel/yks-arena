"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchContinueToNextQuestion = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const validation_1 = require("../shared/validation");
/**
 * Continue to Next Question
 *
 * Architecture Decision:
 * - Q1 doğru olduğunda phase RESULT'a geçer
 * - Kullanıcı "Devam" butonuna basınca bu function çağrılır
 * - nextQuestionId'yi activeQuestionId'ye set eder ve phase'i QUESTION yapar
 */
exports.matchContinueToNextQuestion = (0, https_1.onCall)({ region: "europe-west1" }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    // Zod validation
    let validatedInput;
    try {
        validatedInput = (0, validation_1.strictParse)(validation_1.ContinueToNextQuestionInputSchema, req.data, "matchContinueToNextQuestion");
    }
    catch (error) {
        throw new https_1.HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid input");
    }
    const matchId = validatedInput.matchId;
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const result = await firestore_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(matchRef);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = snap.data();
        if (!match)
            throw new https_1.HttpsError("internal", "Match data is invalid");
        if (match.status !== "ACTIVE")
            throw new https_1.HttpsError("failed-precondition", "Match not active");
        if (match.turn?.phase !== "RESULT")
            throw new https_1.HttpsError("failed-precondition", "Not in RESULT phase");
        if (match.turn?.currentUid !== uid)
            throw new https_1.HttpsError("failed-precondition", "Not your turn");
        const nextQuestionId = match.turn?.nextQuestionId;
        if (!nextQuestionId) {
            throw new https_1.HttpsError("failed-precondition", "nextQuestionId missing (should be set after Q1 correct)");
        }
        // Move to next question
        tx.update(matchRef, {
            "turn.phase": "QUESTION",
            "turn.activeQuestionId": nextQuestionId,
            "turn.nextQuestionId": null, // Clear nextQuestionId
            "turn.questionIndex": 2, // ✅ second question
        });
        return {
            matchId,
            status: "ACTIVE",
            phase: "QUESTION",
            questionId: nextQuestionId,
            questionIndex: 2,
        };
    });
    return result;
});
