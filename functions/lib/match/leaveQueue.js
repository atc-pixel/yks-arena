"use strict";
/**
 * matchLeaveQueue Cloud Function
 *
 * Kullanıcının queue'dan çıkmasını sağlar.
 * Sadece WAITING durumundaki ticket'lar silinebilir.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchLeaveQueue = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const validation_1 = require("../shared/validation");
const constants_1 = require("../shared/constants");
// ============================================================================
// CONSTANTS
// ============================================================================
const MATCH_QUEUE_COLLECTION = "match_queue";
// ============================================================================
// MAIN FUNCTION
// ============================================================================
exports.matchLeaveQueue = (0, https_1.onCall)({ region: constants_1.FUNCTIONS_REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    // Zod validation (boş object)
    (0, validation_1.strictParse)(validation_1.LeaveQueueInputSchema, req.data, "matchLeaveQueue");
    const ticketRef = firestore_1.db.collection(MATCH_QUEUE_COLLECTION).doc(uid);
    await firestore_1.db.runTransaction(async (tx) => {
        const ticketSnap = await tx.get(ticketRef);
        if (!ticketSnap.exists) {
            // Not in queue - no-op, return success
            return;
        }
        const ticket = ticketSnap.data();
        // Only delete if WAITING (not already matched)
        if (ticket.status === "WAITING") {
            tx.delete(ticketRef);
            console.log(`[Matchmaking] Left queue: ${uid}`);
        }
        // If MATCHED, do nothing - match already created
    });
    return { success: true };
});
