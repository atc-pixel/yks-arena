"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchCreateInvite = void 0;
// functions/src/match/createInvite.ts
const https_1 = require("firebase-functions/v2/https");
const nanoid_1 = require("nanoid");
const firestore_1 = require("../utils/firestore");
const ensure_1 = require("../users/ensure");
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
    // Gate: energy > 0 AND activeMatchCount < energy
    const userSnap = await firestore_1.db.collection("users").doc(uid).get();
    if (!userSnap.exists)
        throw new https_1.HttpsError("internal", "User doc missing");
    const user = userSnap.data();
    const energy = Number(user?.economy?.energy ?? 0);
    const activeMatchCount = Number(user?.presence?.activeMatchCount ?? 0);
    if (energy <= 0)
        throw new https_1.HttpsError("failed-precondition", "ENERGY_ZERO");
    if (activeMatchCount >= energy)
        throw new https_1.HttpsError("failed-precondition", "MATCH_LIMIT_REACHED");
    const matchRef = firestore_1.db.collection("matches").doc();
    const code = await allocateInviteCode(6);
    const now = firestore_1.Timestamp.now();
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
    await firestore_1.db.collection("invites").doc(code).set({
        createdAt: now,
        createdBy: uid,
        matchId: matchRef.id,
        status: "OPEN",
    });
    return { code, matchId: matchRef.id };
});
