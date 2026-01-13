"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelInvite = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const energy_1 = require("../users/energy");
const firestore_2 = require("firebase-admin/firestore");
const validation_1 = require("../shared/validation");
/**
 * Cancels an invite that is still WAITING.
 * - Only host can cancel.
 * - Decrements host presence.activeMatchCount by 1 (slot refund).
 * - Marks invite as CANCELLED and match as CANCELLED (or CLOSED).
 */
exports.cancelInvite = (0, https_1.onCall)({ region: "us-central1" }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Login required.");
    // Zod validation
    let validatedInput;
    try {
        validatedInput = (0, validation_1.strictParse)(validation_1.CancelInviteInputSchema, req.data, "cancelInvite");
    }
    catch (error) {
        throw new https_1.HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid input");
    }
    const inviteId = validatedInput.inviteId;
    const inviteRef = firestore_1.db.collection("invites").doc(inviteId);
    await firestore_1.db.runTransaction(async (tx) => {
        const inviteSnap = await tx.get(inviteRef);
        if (!inviteSnap.exists) {
            throw new https_1.HttpsError("not-found", "Invite not found.");
        }
        const invite = inviteSnap.data();
        if (!invite)
            throw new https_1.HttpsError("internal", "Invite data is invalid");
        // Must be host (createdBy is the host)
        const hostUid = invite.createdBy;
        if (!hostUid || hostUid !== uid) {
            throw new https_1.HttpsError("permission-denied", "Only host can cancel this invite.");
        }
        const status = invite.status;
        const matchId = invite.matchId;
        // Idempotency: if already cancelled/closed, do nothing
        if (status === "CANCELLED" || status === "CLOSED")
            return;
        // Only OPEN invites can be cancelled safely
        if (status !== "OPEN") {
            throw new https_1.HttpsError("failed-precondition", `Invite cannot be cancelled in status=${status}.`);
        }
        // matchId might not exist yet (match created when opponent joins)
        // Only cancel match if it exists
        const matchRef = matchId ? firestore_1.db.collection("matches").doc(matchId) : null;
        const matchSnap = matchRef ? await tx.get(matchRef) : null;
        // If match doc missing, still refund slot and close invite
        const hostUserRef = firestore_1.db.collection("users").doc(uid);
        const hostUserSnap = await tx.get(hostUserRef);
        if (!hostUserSnap.exists) {
            throw new https_1.HttpsError("failed-precondition", "User profile missing.");
        }
        // Optional: apply refill (doesn't matter much here, but keeps economy consistent)
        const hostUser = hostUserSnap.data();
        if (!hostUser)
            throw new https_1.HttpsError("internal", "Host user data is invalid");
        const nowMs = Date.now();
        (0, energy_1.applyHourlyRefillTx)({
            tx,
            userRef: hostUserRef,
            userData: hostUser,
            nowMs,
        });
        // Refund slot: activeMatchCount -= 1 (clamp to >=0 by doing read+set)
        const currentActive = Number(hostUser.presence?.activeMatchCount ?? 0);
        const nextActive = Math.max(0, currentActive - 1);
        tx.update(hostUserRef, { "presence.activeMatchCount": nextActive });
        // Close invite
        tx.update(inviteRef, {
            status: "CANCELLED",
            cancelledAt: firestore_2.FieldValue.serverTimestamp(),
        });
        // Close match (only if exists and still in a cancellable state)
        if (matchRef && matchSnap && matchSnap.exists) {
            const match = matchSnap.data();
            if (!match)
                return; // Match data invalid, skip
            const matchStatus = match.status;
            // Only cancel if match not already finished/started, keep it conservative
            // Typical values: "WAITING" -> "ACTIVE" -> "FINISHED"
            if (matchStatus === "WAITING") {
                tx.update(matchRef, {
                    status: "CANCELLED",
                    cancelledAt: firestore_2.FieldValue.serverTimestamp(),
                });
            }
        }
    });
    return { ok: true };
});
