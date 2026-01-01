"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchJoinInvite = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const ensure_1 = require("../users/ensure");
const energy_1 = require("../users/energy");
exports.matchJoinInvite = (0, https_1.onCall)(async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    await (0, ensure_1.ensureUserDoc)(uid);
    const code = String(req.data?.code ?? "").toUpperCase().trim();
    if (!code)
        throw new https_1.HttpsError("invalid-argument", "code required");
    const inviteRef = firestore_1.db.collection("invites").doc(code);
    const matchRef = firestore_1.db.collection("matches").doc(); // placeholder, will be overwritten below
    await firestore_1.db.runTransaction(async (tx) => {
        const inviteSnap = await tx.get(inviteRef);
        if (!inviteSnap.exists)
            throw new https_1.HttpsError("not-found", "Invite not found");
        const invite = inviteSnap.data();
        if (!invite || invite.status !== "OPEN")
            throw new https_1.HttpsError("failed-precondition", "Invite not open");
        const realMatchRef = firestore_1.db.collection("matches").doc(invite.matchId);
        const matchSnap = await tx.get(realMatchRef);
        if (!matchSnap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = matchSnap.data();
        if (!match)
            throw new https_1.HttpsError("internal", "Match data is invalid");
        if (match.status !== "WAITING")
            throw new https_1.HttpsError("failed-precondition", "Match not waiting");
        const hostUid = match.players?.[0];
        if (!hostUid)
            throw new https_1.HttpsError("internal", "Host missing");
        if (hostUid === uid)
            throw new https_1.HttpsError("failed-precondition", "Cannot join your own match");
        // Gate checks for BOTH players:
        // energy > 0 AND activeMatchCount < energy
        const hostUserRef = firestore_1.db.collection("users").doc(hostUid);
        const joinUserRef = firestore_1.db.collection("users").doc(uid);
        const [hostUserSnap, joinUserSnap] = await Promise.all([
            tx.get(hostUserRef),
            tx.get(joinUserRef),
        ]);
        if (!hostUserSnap.exists)
            throw new https_1.HttpsError("failed-precondition", "HOST_USER_MISSING");
        if (!joinUserSnap.exists)
            throw new https_1.HttpsError("failed-precondition", "JOIN_USER_MISSING");
        const hostUser = hostUserSnap.data();
        const joinUser = joinUserSnap.data();
        // Hourly energy refill for BOTH players must happen inside the same TX.
        const nowMs = Date.now();
        const { energyAfter: hostEnergy } = (0, energy_1.applyHourlyRefillTx)({
            tx,
            userRef: hostUserRef,
            userData: hostUser,
            nowMs,
        });
        const { energyAfter: joinEnergy } = (0, energy_1.applyHourlyRefillTx)({
            tx,
            userRef: joinUserRef,
            userData: joinUser,
            nowMs,
        });
        const hostActive = Number(hostUser?.presence?.activeMatchCount ?? 0);
        const joinActive = Number(joinUser?.presence?.activeMatchCount ?? 0);
        if (hostEnergy <= 0)
            throw new https_1.HttpsError("failed-precondition", "HOST_ENERGY_ZERO");
        if (joinEnergy <= 0)
            throw new https_1.HttpsError("failed-precondition", "ENERGY_ZERO");
        if (hostActive >= hostEnergy)
            throw new https_1.HttpsError("failed-precondition", "HOST_MATCH_LIMIT_REACHED");
        if (joinActive >= joinEnergy)
            throw new https_1.HttpsError("failed-precondition", "MATCH_LIMIT_REACHED");
        // Transition match to ACTIVE
        if (!match.players || match.players.length === 0) {
            throw new https_1.HttpsError("internal", "Match players array missing or empty");
        }
        tx.update(realMatchRef, {
            status: "ACTIVE",
            players: [hostUid, uid],
            // host starts
            "turn.currentUid": hostUid,
            "turn.phase": "SPIN",
            "turn.challengeSymbol": null,
            "turn.streak": 0,
            "turn.activeQuestionId": null,
            "turn.usedQuestionIds": [],
            stateByUid: {
                [hostUid]: match.stateByUid?.[hostUid] ??
                    { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
                [uid]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
            },
        });
        // Mark invite used
        tx.update(inviteRef, { status: "USED" });
        // Concurrency:
        // - Host already consumed a slot when creating the invite.
        // - Joiner consumes a slot now.
        tx.update(joinUserRef, {
            "presence.activeMatchCount": firestore_1.FieldValue.increment(1),
        });
    });
    // Return matchId from invite doc (non-transactional read is fine here)
    const inviteSnap2 = await inviteRef.get();
    const invite2 = inviteSnap2.data();
    if (!invite2?.matchId)
        throw new https_1.HttpsError("internal", "Invite matchId missing");
    return { matchId: invite2.matchId };
});
