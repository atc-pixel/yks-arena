import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";

export const matchJoinInvite = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  const code = String(req.data?.code ?? "").toUpperCase().trim();
  if (!code) throw new HttpsError("invalid-argument", "code required");

  const inviteRef = db.collection("invites").doc(code);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) throw new HttpsError("not-found", "Invite not found");

  const invite = inviteSnap.data() as any;
  if (invite.status !== "OPEN") throw new HttpsError("failed-precondition", "Invite not open");

  const matchRef = db.collection("matches").doc(invite.matchId);

  await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found");

    const match = matchSnap.data() as any;
    if (match.status !== "WAITING") throw new HttpsError("failed-precondition", "Match not waiting");

    const hostUid = match.players?.[0];
    if (!hostUid) throw new HttpsError("internal", "Host missing");
    if (hostUid === uid) throw new HttpsError("failed-precondition", "Cannot join your own match");

    tx.update(matchRef, {
      status: "ACTIVE",
      players: [hostUid, uid],
      // turn zaten SPIN, host başlasın
      "turn.currentUid": hostUid,
      "turn.phase": "SPIN",
      "turn.challengeSymbol": null,
      "turn.streak": 0,
      "turn.activeQuestionId": null,
      "turn.usedQuestionIds": [],
      stateByUid: {
        [hostUid]: match.stateByUid?.[hostUid] ?? { lives: 5, points: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
        [uid]: { lives: 5, points: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
      },
    });

    tx.update(inviteRef, { status: "USED" });
  });

  return { matchId: invite.matchId };
});
