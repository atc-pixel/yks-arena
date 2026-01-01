"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelInvite = void 0;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("../utils/firestore");
const energy_1 = require("../users/energy");
const firestore_2 = require("firebase-admin/firestore");
/**
 * Cancels an invite that is still WAITING.
 * - Only host can cancel.
 * - Decrements host presence.activeMatchCount by 1 (slot refund).
 * - Marks invite as CANCELLED and match as CANCELLED (or CLOSED).
 */
exports.cancelInvite = functions
    .region("europe-west1")
    .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid)
        throw new functions.https.HttpsError("unauthenticated", "Login required.");
    const inviteId = String(data?.inviteId ?? "");
    if (!inviteId)
        throw new functions.https.HttpsError("invalid-argument", "inviteId is required.");
    const inviteRef = firestore_1.db.collection("invites").doc(inviteId);
    await firestore_1.db.runTransaction(async (tx) => {
        const inviteSnap = await tx.get(inviteRef);
        if (!inviteSnap.exists) {
            throw new functions.https.HttpsError("not-found", "Invite not found.");
        }
        const invite = inviteSnap.data();
        if (!invite)
            throw new functions.https.HttpsError("internal", "Invite data is invalid");
        // Must be host (createdBy is the host)
        const hostUid = invite.createdBy;
        if (!hostUid || hostUid !== uid) {
            throw new functions.https.HttpsError("permission-denied", "Only host can cancel this invite.");
        }
        const status = invite.status;
        const matchId = invite.matchId;
        // Idempotency: if already cancelled/closed, do nothing
        if (status === "CANCELLED" || status === "CLOSED")
            return;
        // Only OPEN invites can be cancelled safely
        if (status !== "OPEN") {
            throw new functions.https.HttpsError("failed-precondition", `Invite cannot be cancelled in status=${status}.`);
        }
        if (!matchId) {
            throw new functions.https.HttpsError("failed-precondition", "Invite is missing matchId.");
        }
        const matchRef = firestore_1.db.collection("matches").doc(matchId);
        const matchSnap = await tx.get(matchRef);
        // If match doc missing, still refund slot and close invite
        const hostUserRef = firestore_1.db.collection("users").doc(uid);
        const hostUserSnap = await tx.get(hostUserRef);
        if (!hostUserSnap.exists) {
            throw new functions.https.HttpsError("failed-precondition", "User profile missing.");
        }
        // Optional: apply refill (doesn't matter much here, but keeps economy consistent)
        const hostUser = hostUserSnap.data();
        if (!hostUser)
            throw new functions.https.HttpsError("internal", "Host user data is invalid");
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
        if (matchSnap.exists) {
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
