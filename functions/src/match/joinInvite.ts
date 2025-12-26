import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "../utils/firestore";
import { ensureUserDoc } from "../users/ensure";

export const matchJoinInvite = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  await ensureUserDoc(uid);

  const code = String(req.data?.code ?? "").toUpperCase().trim();
  if (!code) throw new HttpsError("invalid-argument", "code required");

  const inviteRef = db.collection("invites").doc(code);
  const matchRef = db.collection("matches").doc(); // placeholder, will be overwritten below

  await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) throw new HttpsError("not-found", "Invite not found");

    const invite = inviteSnap.data() as any;
    if (invite.status !== "OPEN") throw new HttpsError("failed-precondition", "Invite not open");

    const realMatchRef = db.collection("matches").doc(invite.matchId);

    const matchSnap = await tx.get(realMatchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found");

    const match = matchSnap.data() as any;
    if (match.status !== "WAITING") throw new HttpsError("failed-precondition", "Match not waiting");

    const hostUid = match.players?.[0];
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

    const hostUser = hostUserSnap.data() as any;
    const joinUser = joinUserSnap.data() as any;

    const hostEnergy = Number(hostUser?.economy?.energy ?? 0);
    const hostActive = Number(hostUser?.presence?.activeMatchCount ?? 0);

    const joinEnergy = Number(joinUser?.economy?.energy ?? 0);
    const joinActive = Number(joinUser?.presence?.activeMatchCount ?? 0);

    if (hostEnergy <= 0) throw new HttpsError("failed-precondition", "HOST_ENERGY_ZERO");
    if (joinEnergy <= 0) throw new HttpsError("failed-precondition", "ENERGY_ZERO");

    if (hostActive >= hostEnergy) throw new HttpsError("failed-precondition", "HOST_MATCH_LIMIT_REACHED");
    if (joinActive >= joinEnergy) throw new HttpsError("failed-precondition", "MATCH_LIMIT_REACHED");

    // Transition match to ACTIVE
    tx.update(realMatchRef, {
      status: "ACTIVE",
      players: [hostUid, uid],

      // host starts
      "turn.currentUid": hostUid,
      "turn.phase": "SPIN",
      "turn.challengeSymbol": null,
      "turn.streak": 0,
      "turn.activeQuestionId": null,
      "turn.usedQuestionIds": [],

      stateByUid: {
        [hostUid]:
          match.stateByUid?.[hostUid] ??
          { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
        [uid]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
      },
    });

    // Mark invite used
    tx.update(inviteRef, { status: "USED" });

    // Increment active match count for BOTH users (now match is ACTIVE)
    tx.update(hostUserRef, {
      "presence.activeMatchCount": FieldValue.increment(1),
    });
    tx.update(joinUserRef, {
      "presence.activeMatchCount": FieldValue.increment(1),
    });
  });

  // Return matchId from invite doc (non-transactional read is fine here)
  const inviteSnap2 = await inviteRef.get();
  const invite2 = inviteSnap2.data() as any;
  return { matchId: invite2?.matchId };
});
