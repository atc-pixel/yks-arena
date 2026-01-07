import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "../utils/firestore";
import { USER_COLLECTION, UserDoc } from "./types";
import { guestNameFromUid } from "./utils";

export const ensureUserProfile = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  const userRef = db.collection(USER_COLLECTION).doc(uid);

  // idempotent
  const existing = await userRef.get();
  if (existing.exists) return { ok: true, created: false };

  const doc: Omit<UserDoc, "createdAt" | "economy"> & {
    createdAt: FirebaseFirestore.FieldValue;
    economy: {
      energy: number;
      maxEnergy: number;
      lastEnergyRefill: FirebaseFirestore.FieldValue;
    };
  } = {
    displayName: guestNameFromUid(uid),
    photoURL: null,

    trophies: 0,
    level: 1,

    league: { currentLeague: "Teneke", weeklyTrophies: 0 },
    stats: { totalMatches: 0, totalWins: 0 },

    economy: {
      energy: 5,
      maxEnergy: 5,
      lastEnergyRefill: FieldValue.serverTimestamp(),
    },

    createdAt: FieldValue.serverTimestamp(),
  };

  await userRef.set(doc, { merge: false });
  return { ok: true, created: true };
});
