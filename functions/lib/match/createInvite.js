"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchCreateInvite = void 0;
// functions/src/match/createInvite.ts
const https_1 = require("firebase-functions/v2/https");
const nanoid_1 = require("nanoid");
const firestore_1 = require("../utils/firestore");
const ensure_1 = require("../users/ensure");
const energy_1 = require("../users/energy");
const validation_1 = require("../shared/validation");
const constants_1 = require("../shared/constants");
// #region agent log
function __agentLog(hypothesisId, location, message, data = {}) {
    try {
        console.log(JSON.stringify({
            sessionId: "debug-session",
            runId: "pre-fix",
            hypothesisId,
            location,
            message,
            data,
            timestamp: Date.now(),
        }));
    }
    catch {
        // ignore
    }
}
function __agentErr(hypothesisId, location, message, data = {}) {
    try {
        console.error(JSON.stringify({
            sessionId: "debug-session",
            runId: "pre-fix",
            hypothesisId,
            location,
            message,
            data,
            timestamp: Date.now(),
        }));
    }
    catch {
        // ignore
    }
}
// #endregion
async function allocateInviteCode(len = 6, tries = 5) {
    for (let i = 0; i < tries; i++) {
        const code = (0, nanoid_1.nanoid)(len).toUpperCase();
        const snap = await firestore_1.db.collection("invites").doc(code).get();
        if (!snap.exists)
            return code;
    }
    throw new https_1.HttpsError("internal", "Failed to allocate invite code.");
}
exports.matchCreateInvite = (0, https_1.onCall)({ region: constants_1.FUNCTIONS_REGION }, async (req) => {
    const uid = req.auth?.uid;
    __agentLog("H1", "functions/src/match/createInvite.ts:entry", "matchCreateInvite called", {
        hasAuth: !!uid,
        dataType: typeof req.data,
    });
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    // Zod validation - input boş object olmalı
    try {
        (0, validation_1.strictParse)(validation_1.CreateInviteInputSchema, req.data, "matchCreateInvite");
    }
    catch (error) {
        __agentErr("H2", "functions/src/match/createInvite.ts:parse_error", "CreateInviteInputSchema parse failed", {
            err: error instanceof Error ? error.message : String(error),
        });
        throw new https_1.HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid input");
    }
    try {
        await (0, ensure_1.ensureUserDoc)(uid);
    }
    catch (e) {
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
    const inviteRef = firestore_1.db.collection("invites").doc(code);
    await firestore_1.db.runTransaction(async (tx) => {
        const userRef = firestore_1.db.collection("users").doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists)
            throw new https_1.HttpsError("internal", "User doc missing");
        // Firestore TX rule: ALL reads must happen before ANY writes.
        // allocateInviteCode() is outside TX, but this read must still happen before applyHourlyRefillTx (which writes).
        const inviteSnap = await tx.get(inviteRef);
        if (inviteSnap.exists)
            throw new https_1.HttpsError("aborted", "Invite code already exists, retry.");
        // Hourly refill must be checked inside the TX.
        const user = userSnap.data();
        const nowMs = Date.now();
        const { energyAfter: energy } = (0, energy_1.applyHourlyRefillTx)({ tx, userRef, userData: user, nowMs });
        // Type-safe presence check
        const activeMatchCount = Number(user?.presence?.activeMatchCount ?? 0);
        __agentLog("H3", "functions/src/match/createInvite.ts:tx:energy_checked", "energy checked", {
            uid,
            energy,
            activeMatchCount,
        });
        // Gate: Energy > 0 AND Energy > activeMatchCount
        if (energy <= 0)
            throw new https_1.HttpsError("failed-precondition", "ENERGY_ZERO");
        if (activeMatchCount >= energy)
            throw new https_1.HttpsError("failed-precondition", "MATCH_LIMIT_REACHED");
        const now = firestore_1.Timestamp.now();
        // Only create invite, match will be created when opponent joins
        tx.set(inviteRef, {
            createdAt: now,
            createdBy: uid,
            status: "OPEN",
            // matchId will be set when opponent joins
        });
        // Concurrency: opening an invite consumes an active match slot.
        tx.update(userRef, {
            "presence.activeMatchCount": firestore_1.FieldValue.increment(1),
        });
    });
    // Return only code, matchId will be created when opponent joins
    __agentLog("H1", "functions/src/match/createInvite.ts:exit", "matchCreateInvite returned", { uid, codeLen: code.length });
    return { code };
});
