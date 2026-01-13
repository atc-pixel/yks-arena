"use strict";
/**
 * measureRTT Function
 *
 * Sync duel match'inde RTT (Round-Trip Time) ölçümü yapar.
 * - Her round başında veya periyodik olarak çağrılır
 * - Client'tan gelen clientTimestamp ile server timestamp'i karşılaştırır
 * - rttMs = serverReceiveAt - clientTimestamp
 * - oneWayLatencyMs = rttMs / 2
 * - syncDuel.playerLatencies[uid] güncellenir
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchMeasureRTT = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const validation_1 = require("../shared/validation");
exports.matchMeasureRTT = (0, https_1.onCall)({ region: "us-central1" }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const { matchId, clientTimestamp } = (0, validation_1.strictParse)(validation_1.MeasureRTTInputSchema, req.data, "matchMeasureRTT");
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const serverReceiveAt = Date.now();
    // RTT = (serverReceiveAt - clientTimestamp) (one-way latency * 2)
    // Basit yaklaşım: clientTimestamp ping için gönderilir, RTT hesaplanır
    const rttMs = Math.max(0, serverReceiveAt - clientTimestamp);
    const oneWayLatencyMs = rttMs / 2;
    await firestore_1.db.runTransaction(async (tx) => {
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = matchSnap.data();
        if (!match)
            throw new https_1.HttpsError("internal", "Match data invalid");
        if (match.mode !== "SYNC_DUEL")
            throw new https_1.HttpsError("failed-precondition", "Not a sync duel match");
        const syncDuel = match.syncDuel;
        if (!syncDuel)
            throw new https_1.HttpsError("internal", "SyncDuel state missing");
        const updatedLatencies = {
            ...syncDuel.playerLatencies,
            [uid]: {
                rttMs,
                oneWayLatencyMs,
                measuredAt: serverReceiveAt,
            },
        };
        tx.update(matchRef, {
            "syncDuel.playerLatencies": updatedLatencies,
        });
    });
    // Client'a server timestamp döndür (clock sync için)
    return {
        serverTimestamp: serverReceiveAt,
        rttMs,
        oneWayLatencyMs,
    };
});
