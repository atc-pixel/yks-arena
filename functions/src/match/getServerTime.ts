/**
 * getServerTime Function
 *
 * Client clock skew/latency ölçümü için server'ın Date.now() değerini döner.
 * - Time sync (offset) hesaplamak için kullanılır.
 * - Side-effect yok, idempotent.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "../shared/constants";
import { strictParse, GetServerTimeInputSchema } from "../shared/validation";

export const matchGetServerTime = onCall({ region: FUNCTIONS_REGION }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  // Input boş ({}). strictParse null/undefined -> {} normalize eder.
  strictParse(GetServerTimeInputSchema, req.data, "matchGetServerTime");

  return { serverTimeMs: Date.now() };
});

