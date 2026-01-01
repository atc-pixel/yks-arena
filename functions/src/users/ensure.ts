// functions/src/users/ensure.ts

import { db, FieldValue } from "../utils/firestore";
import { USER_COLLECTION, UserDoc } from "./types";
import { guestNameFromUid } from "./utils";

export async function ensureUserDoc(uid: string) {
  const userRef = db.collection(USER_COLLECTION).doc(uid);

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
    league: { currentLeague: "BRONZE", weeklyScore: 0 },
    stats: { totalMatches: 0, totalWins: 0 },
    economy: {
      energy: 5,
      maxEnergy: 5,
      lastEnergyRefill: FieldValue.serverTimestamp(),
    },
    createdAt: FieldValue.serverTimestamp(),
  };

  // create() exists-check atomik. Eğer zaten varsa error verir -> ignore.
  try {
    await userRef.create(doc);
  } catch (e: unknown) {
    // ALREADY_EXISTS: ignore
    // Firestore admin error codes farklı gelebiliyor; güvenli ignore:
    // Error'u log'layabiliriz ama throw etmiyoruz
    if (process.env.NODE_ENV === "development") {
      console.log("User doc already exists (expected):", e);
    }
    return;
  }
}
