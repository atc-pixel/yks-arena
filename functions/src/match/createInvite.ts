// functions/src/match/createInvite.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { nanoid } from "nanoid";
import { db, FieldValue, Timestamp } from "../utils/firestore";
import { ensureUserDoc } from "../users/ensure";
import { applyHourlyRefillTx } from "../users/energy";
import type { UserDoc } from "../users/types";
import { CreateInviteInputSchema, strictParse } from "../shared/validation";
import { FUNCTIONS_REGION } from "../shared/constants";

// #region agent log
function __agentLog(hypothesisId: string, location: string, message: string, data: Record<string, unknown> = {}) {
  try {
    console.log(
      JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now(),
      })
    );
  } catch {
    // ignore
  }
}
function __agentErr(hypothesisId: string, location: string, message: string, data: Record<string, unknown> = {}) {
  try {
    console.error(
      JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now(),
      })
    );
  } catch {
    // ignore
  }
}
// #endregion

async function allocateInviteCode(len = 6, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const code = nanoid(len).toUpperCase();
    const snap = await db.collection("invites").doc(code).get();
    if (!snap.exists) return code;
  }
  throw new HttpsError("internal", "Failed to allocate invite code.");
}

export const matchCreateInvite = onCall(
  { region: FUNCTIONS_REGION },
  async (req) => {
  const uid = req.auth?.uid;
  __agentLog("H1", "functions/src/match/createInvite.ts:entry", "matchCreateInvite called", {
    hasAuth: !!uid,
    dataType: typeof req.data,
  });
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  // Zod validation - input boş object olmalı
  try {
    strictParse(CreateInviteInputSchema, req.data, "matchCreateInvite");
  } catch (error) {
    __agentErr("H2", "functions/src/match/createInvite.ts:parse_error", "CreateInviteInputSchema parse failed", {
      err: error instanceof Error ? error.message : String(error),
    });
    throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid input");
  }

  try {
    await ensureUserDoc(uid);
  } catch (e) {
    __agentErr("H3", "functions/src/match/createInvite.ts:ensureUserDoc_error", "ensureUserDoc failed", {
      err: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  // Allocate code outside TX (fast). Uniqueness is still enforced by invite doc existence.
  const code = await allocateInviteCode(6);
  __agentLog("H3", "functions/src/match/createInvite.ts:code_allocated", "invite code allocated", {
    codeLen: code.length,
  });
  const inviteRef = db.collection("invites").doc(code);

  await db.runTransaction(async (tx) => {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError("internal", "User doc missing");

    // Firestore TX rule: ALL reads must happen before ANY writes.
    // allocateInviteCode() is outside TX, but this read must still happen before applyHourlyRefillTx (which writes).
    const inviteSnap = await tx.get(inviteRef);
    if (inviteSnap.exists) throw new HttpsError("aborted", "Invite code already exists, retry.");

    // Hourly refill must be checked inside the TX.
    const user = userSnap.data() as UserDoc | undefined;
    const nowMs = Date.now();
    const { energyAfter: energy } = applyHourlyRefillTx({ tx, userRef, userData: user, nowMs });

    // Type-safe presence check
    const activeMatchCount = Number(user?.presence?.activeMatchCount ?? 0);
    __agentLog("H3", "functions/src/match/createInvite.ts:tx:energy_checked", "energy checked", {
      uid,
      energy,
      activeMatchCount,
    });

    // Gate: Energy > 0 AND Energy > activeMatchCount
    if (energy <= 0) throw new HttpsError("failed-precondition", "ENERGY_ZERO");
    if (activeMatchCount >= energy) throw new HttpsError("failed-precondition", "MATCH_LIMIT_REACHED");

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
  __agentLog("H1", "functions/src/match/createInvite.ts:exit", "matchCreateInvite returned", { uid, codeLen: code.length });
  return { code };
});
