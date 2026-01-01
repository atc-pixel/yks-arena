"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchCreateInvite = void 0;
// functions/src/match/createInvite.ts
const https_1 = require("firebase-functions/v2/https");
const nanoid_1 = require("nanoid");
const firestore_1 = require("../utils/firestore");
const ensure_1 = require("../users/ensure");
const energy_1 = require("../users/energy");
async function allocateInviteCode(len = 6, tries = 5) {
    for (let i = 0; i < tries; i++) {
        const code = (0, nanoid_1.nanoid)(len).toUpperCase();
        const snap = await firestore_1.db.collection("invites").doc(code).get();
        if (!snap.exists)
            return code;
    }
    throw new https_1.HttpsError("internal", "Failed to allocate invite code.");
}
exports.matchCreateInvite = (0, https_1.onCall)(async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    await (0, ensure_1.ensureUserDoc)(uid);
    // Allocate code outside TX (fast). Uniqueness is still enforced by invite doc existence.
    const code = await allocateInviteCode(6);
    const matchRef = firestore_1.db.collection("matches").doc();
    const inviteRef = firestore_1.db.collection("invites").doc(code);
    await firestore_1.db.runTransaction(async (tx) => {
        const userRef = firestore_1.db.collection("users").doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists)
            throw new https_1.HttpsError("internal", "User doc missing");
        // Hourly refill must be checked inside the TX.
        const user = userSnap.data();
        const nowMs = Date.now();
        const { energyAfter: energy } = (0, energy_1.applyHourlyRefillTx)({ tx, userRef, userData: user, nowMs });
        // Type-safe presence check
        const activeMatchCount = Number(user?.presence?.activeMatchCount ?? 0);
        // Gate: Energy > 0 AND Energy > activeMatchCount
        if (energy <= 0)
            throw new https_1.HttpsError("failed-precondition", "ENERGY_ZERO");
        if (activeMatchCount >= energy)
            throw new https_1.HttpsError("failed-precondition", "MATCH_LIMIT_REACHED");
        // Make sure invite code wasn't taken between allocateInviteCode and now.
        const inviteSnap = await tx.get(inviteRef);
        if (inviteSnap.exists)
            throw new https_1.HttpsError("aborted", "Invite code already exists, retry.");
        const now = firestore_1.Timestamp.now();
        tx.set(matchRef, {
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
        tx.set(inviteRef, {
            createdAt: now,
            createdBy: uid,
            matchId: matchRef.id,
            status: "OPEN",
        });
        // Concurrency: opening an invite consumes an active match slot.
        tx.update(userRef, {
            "presence.activeMatchCount": firestore_1.FieldValue.increment(1),
        });
    });
    return { code, matchId: matchRef.id };
});
