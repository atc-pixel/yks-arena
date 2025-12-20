"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchCreateInvite = void 0;
// functions/src/match/createInvite.ts
const https_1 = require("firebase-functions/v2/https");
const nanoid_1 = require("nanoid");
const firestore_1 = require("../utils/firestore");
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
        },
        stateByUid: {
            [uid]: {
                lives: 5,
                points: 0,
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
