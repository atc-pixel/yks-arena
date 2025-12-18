"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchJoinInvite = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
exports.matchJoinInvite = (0, https_1.onCall)(async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const code = String(req.data?.code ?? "").toUpperCase().trim();
    if (!code)
        throw new https_1.HttpsError("invalid-argument", "code required");
    const inviteRef = firestore_1.db.collection("invites").doc(code);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists)
        throw new https_1.HttpsError("not-found", "Invite not found");
    const invite = inviteSnap.data();
    if (invite.status !== "OPEN")
        throw new https_1.HttpsError("failed-precondition", "Invite not open");
    const matchRef = firestore_1.db.collection("matches").doc(invite.matchId);
    await firestore_1.db.runTransaction(async (tx) => {
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = matchSnap.data();
        if (match.status !== "WAITING")
            throw new https_1.HttpsError("failed-precondition", "Match not waiting");
        const hostUid = match.players?.[0];
        if (!hostUid)
            throw new https_1.HttpsError("internal", "Host missing");
        if (hostUid === uid)
            throw new https_1.HttpsError("failed-precondition", "Cannot join your own match");
        tx.update(matchRef, {
            status: "ACTIVE",
            players: [hostUid, uid],
            // turn zaten SPIN, host başlasın
            "turn.currentUid": hostUid,
            "turn.phase": "SPIN",
            "turn.challengeSymbol": null,
            "turn.streak": 0,
            "turn.activeQuestionId": null,
            "turn.usedQuestionIds": [],
            stateByUid: {
                [hostUid]: match.stateByUid?.[hostUid] ?? { lives: 5, points: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
                [uid]: { lives: 5, points: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
            },
        });
        tx.update(inviteRef, { status: "USED" });
    });
    return { matchId: invite.matchId };
});
