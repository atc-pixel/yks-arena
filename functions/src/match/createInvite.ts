// functions/src/match/createInvite.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { nanoid } from "nanoid";
import { db, FieldValue, Timestamp } from "../utils/firestore";
import { ensureUserDoc } from "../users/ensure";
import { applyHourlyRefillTx } from "../users/energy";
import type { UserDoc } from "../users/types";
import { CreateInviteInputSchema, strictParse } from "../shared/validation";

async function allocateInviteCode(len = 6, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const code = nanoid(len).toUpperCase();
    const snap = await db.collection("invites").doc(code).get();
    if (!snap.exists) return code;
  }
  throw new HttpsError("internal", "Failed to allocate invite code.");
}

export const matchCreateInvite = onCall(
  { region: "us-central1" },
  async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  // Zod validation - input boş object olmalı
  try {
    strictParse(CreateInviteInputSchema, req.data, "matchCreateInvite");
  } catch (error) {
    throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid input");
  }

  await ensureUserDoc(uid);

  // Allocate code outside TX (fast). Uniqueness is still enforced by invite doc existence.
  const code = await allocateInviteCode(6);
  const inviteRef = db.collection("invites").doc(code);

  await db.runTransaction(async (tx) => {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError("internal", "User doc missing");

    // Hourly refill must be checked inside the TX.
    const user = userSnap.data() as UserDoc | undefined;
    const nowMs = Date.now();
    const { energyAfter: energy } = applyHourlyRefillTx({ tx, userRef, userData: user, nowMs });

    // Type-safe presence check
    const activeMatchCount = Number(user?.presence?.activeMatchCount ?? 0);

    // Gate: Energy > 0 AND Energy > activeMatchCount
    if (energy <= 0) throw new HttpsError("failed-precondition", "ENERGY_ZERO");
    if (activeMatchCount >= energy) throw new HttpsError("failed-precondition", "MATCH_LIMIT_REACHED");

    // Make sure invite code wasn't taken between allocateInviteCode and now.
    const inviteSnap = await tx.get(inviteRef);
    if (inviteSnap.exists) throw new HttpsError("aborted", "Invite code already exists, retry.");

    const now = Timestamp.now();

    // Only create invite, match will be created when opponent joins
    tx.set(inviteRef, {
      createdAt: now,
      createdBy: uid,
      status: "OPEN",
      // matchId will be set when opponent joins
    });

    // Concurrency: opening an invite consumes an active match slot.
    tx.update(userRef, {
      "presence.activeMatchCount": FieldValue.increment(1),
    });
  });

  // Return only code, matchId will be created when opponent joins
  return { code };
});
