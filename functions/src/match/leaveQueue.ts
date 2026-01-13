/**
 * matchLeaveQueue Cloud Function
 * 
 * Kullanıcının queue'dan çıkmasını sağlar.
 * Sadece WAITING durumundaki ticket'lar silinebilir.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type { QueueTicket } from "../shared/types";
import { strictParse, LeaveQueueInputSchema } from "../shared/validation";
import { FUNCTIONS_REGION } from "../shared/constants";

// ============================================================================
// CONSTANTS
// ============================================================================

const MATCH_QUEUE_COLLECTION = "match_queue";

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export const matchLeaveQueue = onCall(
  { region: FUNCTIONS_REGION },
  async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  // Zod validation (boş object)
  strictParse(LeaveQueueInputSchema, req.data, "matchLeaveQueue");

  const ticketRef = db.collection(MATCH_QUEUE_COLLECTION).doc(uid);

  await db.runTransaction(async (tx) => {
    const ticketSnap = await tx.get(ticketRef);
    
    if (!ticketSnap.exists) {
      // Not in queue - no-op, return success
      return;
    }

    const ticket = ticketSnap.data() as QueueTicket;
    
    // Only delete if WAITING (not already matched)
    if (ticket.status === "WAITING") {
      tx.delete(ticketRef);
      console.log(`[Matchmaking] Left queue: ${uid}`);
    }
    // If MATCHED, do nothing - match already created
  });

  return { success: true };
});

