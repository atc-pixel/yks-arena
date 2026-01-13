/**
 * submitSyncDuelAnswer Function
 * 
 * Sync duel match'inde soru cevabı gönderir.
 * - İlk doğru cevap gelince → hemen sıradaki soruya geç
 * - 2 yanlış cevap gelince → sıradaki soruya geç
 * - Doğru cevap için kupa hesapla (0-5 arası)
 * - 3 doğruya ulaşan kontrolü yap
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type { MatchDoc } from "../shared/types";
import { strictParse, SubmitSyncDuelAnswerInputSchema } from "../shared/validation";
import { applySyncDuelAnswerTx } from "./syncDuel.engine";
import { FUNCTIONS_REGION } from "../shared/constants";

export const matchSubmitSyncDuelAnswer = onCall(
  { region: FUNCTIONS_REGION },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

    const { matchId, roundId, answer, clientElapsedMs, clientLatencyMs } = strictParse(
      SubmitSyncDuelAnswerInputSchema,
      req.data,
      "matchSubmitSyncDuelAnswer"
    );

    const matchRef = db.collection("matches").doc(matchId);
    const serverReceiveAt = Date.now(); // Server timestamp

    await db.runTransaction(async (tx) => {
      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found");

      const match = matchSnap.data() as MatchDoc | undefined;
      if (!match) throw new HttpsError("internal", "Match data invalid");
      try {
        await applySyncDuelAnswerTx({
          tx,
          matchRef,
          matchId,
          match,
          uid,
          answer,
          clientElapsedMs,
          clientLatencyMs: clientLatencyMs ?? null,
          serverReceiveAt,
        });
      } catch (e) {
        // Idempotency / race conditions:
        // - UI stale olabilir (bot cevapladı, soru bitti, vs.)
        // - Çift tıklama / latency ile ikinci istek gelebilir
        // Bu durumlarda 400 üretip console'u kirletmek yerine no-op dönelim.
        if (e instanceof HttpsError && e.code === "failed-precondition") {
          const msg = String(e.message || "");
          const isIgnorable =
            msg.includes("Already answered") ||
            msg.includes("Question not active") ||
            msg.includes("No active question");
          if (isIgnorable) return;
        }
        throw e;
      }
    });

    return { success: true };
  }
);
