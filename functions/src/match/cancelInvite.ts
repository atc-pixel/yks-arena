import * as functions from "firebase-functions";
import { db } from "../utils/firestore";
import { applyHourlyRefillTx } from "../users/energy";
import { FieldValue } from "firebase-admin/firestore";
import type { InviteDoc, MatchDoc } from "../shared/types";
import type { UserDoc } from "../users/types";

/**
 * Cancels an invite that is still WAITING.
 * - Only host can cancel.
 * - Decrements host presence.activeMatchCount by 1 (slot refund).
 * - Marks invite as CANCELLED and match as CANCELLED (or CLOSED).
 */
export const cancelInvite = functions
  .region("europe-west1")
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError("unauthenticated", "Login required.");

    const inviteId = String(data?.inviteId ?? "");
    if (!inviteId) throw new functions.https.HttpsError("invalid-argument", "inviteId is required.");

    const inviteRef = db.collection("invites").doc(inviteId);

    await db.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Invite not found.");
      }

      const invite = inviteSnap.data() as InviteDoc | undefined;
      if (!invite) throw new functions.https.HttpsError("internal", "Invite data is invalid");

      // Must be host (createdBy is the host)
      const hostUid = invite.createdBy;
      if (!hostUid || hostUid !== uid) {
        throw new functions.https.HttpsError("permission-denied", "Only host can cancel this invite.");
      }

      const status = invite.status;
      const matchId = invite.matchId;

      // Idempotency: if already cancelled/closed, do nothing
      if (status === "CANCELLED" || status === "CLOSED") return;

      // Only OPEN invites can be cancelled safely
      if (status !== "OPEN") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Invite cannot be cancelled in status=${status}.`
        );
      }

      if (!matchId) {
        throw new functions.https.HttpsError("failed-precondition", "Invite is missing matchId.");
      }

      const matchRef = db.collection("matches").doc(matchId);
      const matchSnap = await tx.get(matchRef);

      // If match doc missing, still refund slot and close invite
      const hostUserRef = db.collection("users").doc(uid);
      const hostUserSnap = await tx.get(hostUserRef);
      if (!hostUserSnap.exists) {
        throw new functions.https.HttpsError("failed-precondition", "User profile missing.");
      }

      // Optional: apply refill (doesn't matter much here, but keeps economy consistent)
      const hostUser = hostUserSnap.data() as UserDoc | undefined;
      if (!hostUser) throw new functions.https.HttpsError("internal", "Host user data is invalid");
      
      const nowMs = Date.now();
      applyHourlyRefillTx({
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
        cancelledAt: FieldValue.serverTimestamp(),
      });

      // Close match (only if exists and still in a cancellable state)
      if (matchSnap.exists) {
        const match = matchSnap.data() as MatchDoc | undefined;
        if (!match) return; // Match data invalid, skip
        const matchStatus = match.status;

        // Only cancel if match not already finished/started, keep it conservative
        // Typical values: "WAITING" -> "ACTIVE" -> "FINISHED"
        if (matchStatus === "WAITING") {
          tx.update(matchRef, {
            status: "CANCELLED",
            cancelledAt: FieldValue.serverTimestamp(),
          });
        }
      }
    });

    return { ok: true };
  });
