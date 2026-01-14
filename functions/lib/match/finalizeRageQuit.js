"use strict";
/**
 * finalizeRageQuit (scheduled)
 *
 * Server-authoritative cleanup:
 * - If a player marked disconnected and didn't reconnect before reconnectDeadline, finish the match.
 * - Applies endedReason = "RAGE_QUIT" and records syncDuel.rageQuitUids.
 *
 * Note: Trophy/Energy penalties are applied in users/onMatchFinished.ts based on endedReason + rageQuitUids.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchFinalizeRageQuit = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const constants_1 = require("../shared/constants");
const BATCH_LIMIT = 50;
exports.matchFinalizeRageQuit = (0, scheduler_1.onSchedule)({ region: constants_1.FUNCTIONS_REGION, schedule: "every 1 minutes" }, async () => {
    const nowMs = Date.now();
    // Query-friendly: only use the min deadline field (single-field index).
    const q = firestore_1.db
        .collection("matches")
        .where("syncDuel.reconnectDeadlineMin", "<=", nowMs)
        .limit(BATCH_LIMIT);
    const snap = await q.get();
    if (snap.empty)
        return;
    await Promise.all(snap.docs.map(async (doc) => {
        const matchRef = doc.ref;
        try {
            await firestore_1.db.runTransaction(async (tx) => {
                const s = await tx.get(matchRef);
                if (!s.exists)
                    return;
                const match = s.data();
                if (!match)
                    return;
                if (match.mode !== "SYNC_DUEL")
                    return;
                if (match.status !== "ACTIVE")
                    return;
                if (!match.syncDuel)
                    return;
                const sd = match.syncDuel;
                const players = match.players ?? [];
                if (players.length !== 2)
                    return;
                const reconnectDeadline = sd.reconnectDeadline ?? {};
                const disconnectedAt = sd.disconnectedAt ?? {};
                const expired = players.filter((uid) => {
                    const d = reconnectDeadline[uid] ?? null;
                    return typeof d === "number" && d > 0 && d <= nowMs;
                });
                // No one expired anymore -> clear min to avoid re-querying.
                if (!expired.length) {
                    tx.update(matchRef, { "syncDuel.reconnectDeadlineMin": null });
                    return;
                }
                // If both expired, cancel match without winner to avoid arbitrary awarding.
                if (expired.length === 2) {
                    tx.update(matchRef, {
                        status: "CANCELLED",
                        endedReason: "DOUBLE_RAGE_QUIT",
                        "syncDuel.matchStatus": "MATCH_FINISHED",
                        "syncDuel.reconnectDeadlineMin": null,
                    });
                    return;
                }
                const quitterUid = expired[0];
                const winnerUid = players.find((u) => u !== quitterUid) ?? null;
                if (!winnerUid)
                    return;
                const rageQuitUids = Array.isArray(sd.rageQuitUids) ? sd.rageQuitUids : [];
                const nextRageQuitUids = rageQuitUids.includes(quitterUid) ? rageQuitUids : [...rageQuitUids, quitterUid];
                // Clear disconnect fields for both to reduce noise
                const nextDisconnectedAt = { ...disconnectedAt };
                const nextReconnectDeadline = { ...reconnectDeadline };
                for (const p of players) {
                    nextDisconnectedAt[p] = null;
                    nextReconnectDeadline[p] = null;
                }
                tx.update(matchRef, {
                    status: "FINISHED",
                    winnerUid,
                    endedReason: "RAGE_QUIT",
                    endedAt: firestore_1.FieldValue.serverTimestamp(),
                    "syncDuel.matchStatus": "MATCH_FINISHED",
                    "syncDuel.rageQuitUids": nextRageQuitUids,
                    "syncDuel.disconnectedAt": nextDisconnectedAt,
                    "syncDuel.reconnectDeadline": nextReconnectDeadline,
                    "syncDuel.reconnectDeadlineMin": null,
                });
            });
        }
        catch (e) {
            if (e instanceof https_1.HttpsError)
                return;
            return;
        }
    }));
});
