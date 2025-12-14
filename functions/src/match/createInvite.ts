import { onCall, HttpsError } from "firebase-functions/v2/https";
import { nanoid } from "nanoid";
import { db, Timestamp } from "../utils/firestore";

export const matchCreateInvite = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  const matchRef = db.collection("matches").doc();
  const code = nanoid(6).toUpperCase();

  await matchRef.set({
    createdAt: Timestamp.now(),
    status: "WAITING",
    mode: "INVITE",
    players: [uid],

    turn: {
      currentUid: uid,
      phase: "SPIN",
      challengeSymbol: null,
      streak: 0,
      activeQuestionId: null,
      usedQuestionIds: [],
    },

    stateByUid: {
      [uid]: { lives: 5, points: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
    },
  });

  await db.collection("invites").doc(code).set({
    createdAt: Timestamp.now(),
    createdBy: uid,
    matchId: matchRef.id,
    status: "OPEN",
  });

  return { code, matchId: matchRef.id };
});
