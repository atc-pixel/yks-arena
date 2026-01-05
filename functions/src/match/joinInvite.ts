import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue, Timestamp } from "../utils/firestore";
import { ensureUserDoc } from "../users/ensure";
import { applyHourlyRefillTx } from "../users/energy";
import type { UserDoc } from "../users/types";
import type { InviteDoc } from "../shared/types";
import { JoinInviteInputSchema, strictParse } from "../shared/validation";

export const matchJoinInvite = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  // Zod validation
  let validatedInput;
  try {
    validatedInput = strictParse(JoinInviteInputSchema, req.data, "matchJoinInvite");
  } catch (error) {
    throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid input");
  }

  await ensureUserDoc(uid);

  const code = validatedInput.code.toUpperCase().trim();

  const inviteRef = db.collection("invites").doc(code);
  const matchRef = db.collection("matches").doc(); // Create new match when opponent joins

  await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) throw new HttpsError("not-found", "Invite not found");

    const invite = inviteSnap.data() as InviteDoc | undefined;
    if (!invite || invite.status !== "OPEN") throw new HttpsError("failed-precondition", "Invite not open");

    const hostUid = invite.createdBy;
    if (!hostUid) throw new HttpsError("internal", "Host missing");
    if (hostUid === uid) throw new HttpsError("failed-precondition", "Cannot join your own match");

    // Gate checks for BOTH players:
    // energy > 0 AND activeMatchCount < energy
    const hostUserRef = db.collection("users").doc(hostUid);
    const joinUserRef = db.collection("users").doc(uid);

    const [hostUserSnap, joinUserSnap] = await Promise.all([
      tx.get(hostUserRef),
      tx.get(joinUserRef),
    ]);

    if (!hostUserSnap.exists) throw new HttpsError("failed-precondition", "HOST_USER_MISSING");
    if (!joinUserSnap.exists) throw new HttpsError("failed-precondition", "JOIN_USER_MISSING");

    const hostUser = hostUserSnap.data() as UserDoc | undefined;
    const joinUser = joinUserSnap.data() as UserDoc | undefined;

    // Hourly energy refill for BOTH players must happen inside the same TX.
    const nowMs = Date.now();
    const { energyAfter: hostEnergy } = applyHourlyRefillTx({
      tx,
      userRef: hostUserRef,
      userData: hostUser,
      nowMs,
    });
    const { energyAfter: joinEnergy } = applyHourlyRefillTx({
      tx,
      userRef: joinUserRef,
      userData: joinUser,
      nowMs,
    });

    const hostActive = Number(hostUser?.presence?.activeMatchCount ?? 0);
    const joinActive = Number(joinUser?.presence?.activeMatchCount ?? 0);

    if (hostEnergy <= 0) throw new HttpsError("failed-precondition", "HOST_ENERGY_ZERO");
    if (joinEnergy <= 0) throw new HttpsError("failed-precondition", "ENERGY_ZERO");

    if (hostActive >= hostEnergy) throw new HttpsError("failed-precondition", "HOST_MATCH_LIMIT_REACHED");
    if (joinActive >= joinEnergy) throw new HttpsError("failed-precondition", "MATCH_LIMIT_REACHED");

    // Create match when opponent joins (2 players ready)
    const now = Timestamp.now();
    tx.set(matchRef, {
      createdAt: now,
      status: "ACTIVE",
      mode: "INVITE",
      players: [hostUid, uid],

      // host starts
      turn: {
        currentUid: hostUid,
        phase: "SPIN",
        challengeSymbol: null,
        streak: 0,
        activeQuestionId: null,
        usedQuestionIds: [],
        streakSymbol: null,
        questionIndex: 0,
      },

      stateByUid: {
        [hostUid]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
        [uid]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
      },
    });

    // Mark invite used and link to match
    tx.update(inviteRef, {
      status: "USED",
      matchId: matchRef.id,
    });

    // Concurrency:
    // - Host already consumed a slot when creating the invite.
    // - Joiner consumes a slot now.
    tx.update(joinUserRef, {
      "presence.activeMatchCount": FieldValue.increment(1),
    });
  });

  // Return matchId (created in transaction)
  return { matchId: matchRef.id };
});
