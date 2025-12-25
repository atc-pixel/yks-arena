// functions/src/match/createInvite.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { nanoid } from "nanoid";
import { db, Timestamp } from "../utils/firestore";

async function allocateInviteCode(len = 6, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const code = nanoid(len).toUpperCase();
    const snap = await db.collection("invites").doc(code).get();
    if (!snap.exists) return code;
  }
  throw new HttpsError("internal", "Failed to allocate invite code.");
}

export const matchCreateInvite = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  const matchRef = db.collection("matches").doc();
  const code = await allocateInviteCode(6);
  const now = Timestamp.now();

  await matchRef.set({
    createdAt: now,
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
      streakSymbol: null,
      questionIndex: 0,


    },

    stateByUid: {
      [uid]: {
        lives: 5,
        trophies: 0,
        symbols: [],
        wrongCount: 0,
        answeredCount: 0,
      },
    },
  });

  await db.collection("invites").doc(code).set({
    createdAt: now,
    createdBy: uid,
    matchId: matchRef.id,
    status: "OPEN",
  });

  return { code, matchId: matchRef.id };
});
