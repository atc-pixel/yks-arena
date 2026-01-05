import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type { MatchDoc } from "../shared/types";
import { ContinueToNextQuestionInputSchema, strictParse } from "../shared/validation";

/**
 * Continue to Next Question
 * 
 * Architecture Decision:
 * - Q1 doğru olduğunda phase RESULT'a geçer
 * - Kullanıcı "Devam" butonuna basınca bu function çağrılır
 * - nextQuestionId'yi activeQuestionId'ye set eder ve phase'i QUESTION yapar
 */
export const matchContinueToNextQuestion = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  // Zod validation
  let validatedInput;
  try {
    validatedInput = strictParse(ContinueToNextQuestionInputSchema, req.data, "matchContinueToNextQuestion");
  } catch (error) {
    throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid input");
  }

  const matchId = validatedInput.matchId;

  const matchRef = db.collection("matches").doc(matchId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new HttpsError("not-found", "Match not found");

    const match = snap.data() as MatchDoc | undefined;
    if (!match) throw new HttpsError("internal", "Match data is invalid");

    if (match.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Match not active");
    if (match.turn?.phase !== "RESULT") throw new HttpsError("failed-precondition", "Not in RESULT phase");
    if (match.turn?.currentUid !== uid) throw new HttpsError("failed-precondition", "Not your turn");

    const nextQuestionId = match.turn?.nextQuestionId;
    if (!nextQuestionId) {
      throw new HttpsError("failed-precondition", "nextQuestionId missing (should be set after Q1 correct)");
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

