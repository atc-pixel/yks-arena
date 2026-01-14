"use strict";
/**
 * startSyncDuelQuestion Function
 *
 * Sync duel match'inde yeni bir soru başlatır.
 * - Seçilen kategoriden random soru seçer
 * - serverStartAt timestamp'i koyar (server authority)
 * - syncDuel.matchStatus: "QUESTION_ACTIVE" yapar
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchStartSyncDuelQuestion = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const validation_1 = require("../shared/validation");
const constants_1 = require("../shared/constants");
const syncDuelStart_logic_1 = require("./syncDuelStart.logic");
exports.matchStartSyncDuelQuestion = (0, https_1.onCall)({ region: constants_1.FUNCTIONS_REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const { matchId } = (0, validation_1.strictParse)(validation_1.StartSyncDuelRoundInputSchema, req.data, "matchStartSyncDuelQuestion");
    const matchRef = firestore_1.db.collection("matches").doc(matchId);
    const nowMs = Date.now();
    const result = await firestore_1.db.runTransaction(async (tx) => {
        const matchSnap = await tx.get(matchRef);
        if (!matchSnap.exists)
            throw new https_1.HttpsError("not-found", "Match not found");
        const match = matchSnap.data();
        if (!match)
            throw new https_1.HttpsError("internal", "Match data invalid");
        if (match.mode !== "SYNC_DUEL")
            throw new https_1.HttpsError("failed-precondition", "Not a sync duel match");
        if (match.status !== "ACTIVE")
            throw new https_1.HttpsError("failed-precondition", "Match not active");
        return await (0, syncDuelStart_logic_1.startSyncDuelQuestionTx)({ tx, matchRef, match, nowMs });
    });
    return result;
});
