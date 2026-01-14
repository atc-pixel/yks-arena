"use strict";
/**
 * Sync Duel presence helpers.
 *
 * Goal: Detect disconnect/reconnect and set a server-authoritative reconnect deadline.
 * Rage quit finalization is handled separately (scheduled/trigger).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchMarkSyncDuelReconnected = exports.matchMarkSyncDuelDisconnected = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const validation_1 = require("../shared/validation");
const constants_1 = require("../shared/constants");
const RECONNECT_WINDOW_MS = 30_000;
function assertPlayer(params) {
    const { match, uid } = params;
    if (!Array.isArray(match.players) || match.players.length !== 2) {
        throw new https_1.HttpsError("internal", "Invalid players");
    }
    if (!match.players.includes(uid)) {
        throw new https_1.HttpsError("permission-denied", "Not a player in this match");
    }
}
function recomputeMinDeadline(reconnectDeadline) {
    const values = Object.values(reconnectDeadline ?? {}).filter((v) => typeof v === "number");
    if (!values.length)
        return null;
    return Math.min(...values);
}
exports.matchMarkSyncDuelDisconnected = (0, https_1.onCall)({ region: constants_1.FUNCTIONS_REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const { matchId } = (0, validation_1.strictParse)(validation_1.MarkSyncDuelDisconnectedInputSchema, req.data, "matchMarkSyncDuelDisconnected");
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const nowMs = Date.now();
    await firestore_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(matchRef);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = snap.data();
        if (!match)
            throw new https_1.HttpsError("internal", "Match data invalid");
        if (match.mode !== "SYNC_DUEL")
            throw new https_1.HttpsError("failed-precondition", "Not a sync duel match");
        if (match.status !== "ACTIVE")
            return;
        if (!match.syncDuel)
            throw new https_1.HttpsError("internal", "SyncDuel state missing");
        assertPlayer({ match, uid });
        const disconnectedAt = { ...(match.syncDuel.disconnectedAt ?? {}) };
        const reconnectDeadline = { ...(match.syncDuel.reconnectDeadline ?? {}) };
        disconnectedAt[uid] = nowMs;
        reconnectDeadline[uid] = nowMs + RECONNECT_WINDOW_MS;
        const reconnectDeadlineMin = recomputeMinDeadline(reconnectDeadline);
        tx.update(matchRef, {
            "syncDuel.disconnectedAt": disconnectedAt,
            "syncDuel.reconnectDeadline": reconnectDeadline,
            "syncDuel.reconnectDeadlineMin": reconnectDeadlineMin,
        });
    });
    return { success: true };
});
exports.matchMarkSyncDuelReconnected = (0, https_1.onCall)({ region: constants_1.FUNCTIONS_REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const { matchId } = (0, validation_1.strictParse)(validation_1.MarkSyncDuelReconnectedInputSchema, req.data, "matchMarkSyncDuelReconnected");
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    await firestore_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(matchRef);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = snap.data();
        if (!match)
            throw new https_1.HttpsError("internal", "Match data invalid");
        if (match.mode !== "SYNC_DUEL")
            throw new https_1.HttpsError("failed-precondition", "Not a sync duel match");
        if (match.status !== "ACTIVE")
            return;
        if (!match.syncDuel)
            throw new https_1.HttpsError("internal", "SyncDuel state missing");
        assertPlayer({ match, uid });
        const disconnectedAt = { ...(match.syncDuel.disconnectedAt ?? {}) };
        const reconnectDeadline = { ...(match.syncDuel.reconnectDeadline ?? {}) };
        disconnectedAt[uid] = null;
        reconnectDeadline[uid] = null;
        const reconnectDeadlineMin = recomputeMinDeadline(reconnectDeadline);
        tx.update(matchRef, {
            "syncDuel.disconnectedAt": disconnectedAt,
            "syncDuel.reconnectDeadline": reconnectDeadline,
            "syncDuel.reconnectDeadlineMin": reconnectDeadlineMin,
        });
    });
    return { success: true };
});
