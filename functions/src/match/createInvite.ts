// functions/src/match/createInvite.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { nanoid } from "nanoid";
import { db, Timestamp } from "../utils/firestore";
import { ensureUserDoc } from "../users/ensure";

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

  await ensureUserDoc(uid);

  // Gate: energy > 0 AND activeMatchCount < energy
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) throw new HttpsError("internal", "User doc missing");

  const user = userSnap.data() as any;
  const energy = Number(user?.economy?.energy ?? 0);
  const activeMatchCount = Number(user?.presence?.activeMatchCount ?? 0);

  if (energy <= 0) throw new HttpsError("failed-precondition", "ENERGY_ZERO");
  if (activeMatchCount >= energy) throw new HttpsError("failed-precondition", "MATCH_LIMIT_REACHED");

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
