"use strict";
/**
 * Auto-advance Sync Duel questions server-side.
 *
 * Why: Client-driven flow can get stuck in QUESTION_RESULT when both clients leave.
 * This trigger ensures QUESTION_RESULT -> QUESTION_ACTIVE progression without requiring a button click.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchAutoAdvanceSyncDuel = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("../utils/firestore");
const constants_1 = require("../shared/constants");
const syncDuelStart_logic_1 = require("./syncDuelStart.logic");
exports.matchAutoAdvanceSyncDuel = (0, firestore_1.onDocumentUpdated)({ document: "matches/{matchId}", region: constants_1.FUNCTIONS_REGION }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after)
        return;
    if (after.mode !== "SYNC_DUEL")
        return;
    if (after.status !== "ACTIVE")
        return;
    if (!after.syncDuel)
        return;
    // Only react on transitions into QUESTION_RESULT (or staying there with a newly ended question).
    const beforeStatus = before?.syncDuel?.matchStatus ?? null;
    const afterStatus = after.syncDuel.matchStatus;
    if (afterStatus !== "QUESTION_RESULT")
        return;
    // If nothing changed, avoid loops.
    if (beforeStatus === "QUESTION_RESULT") {
        const bEndedAt = before?.syncDuel?.questions?.[before.syncDuel.currentQuestionIndex]?.endedAt ?? null;
        const aEndedAt = after.syncDuel.questions?.[after.syncDuel.currentQuestionIndex]?.endedAt ?? null;
        if (bEndedAt === aEndedAt)
            return;
    }
    const matchId = event.params.matchId;
    const matchRef = firestore_2.db.collection("matches").doc(matchId);
    // Small delay helps both clients observe QUESTION_RESULT briefly (UX) and reduces thrash.
    await new Promise((r) => setTimeout(r, 450));
    try {
        await firestore_2.db.runTransaction(async (tx) => {
            const snap = await tx.get(matchRef);
            if (!snap.exists)
                return;
            const match = snap.data();
            if (!match)
                return;
            if (match.mode !== "SYNC_DUEL")
                return;
            if (match.status !== "ACTIVE")
                return;
            if (!match.syncDuel)
                return;
            // Still in QUESTION_RESULT?
            if (match.syncDuel.matchStatus !== "QUESTION_RESULT")
                return;
            const nowMs = Date.now();
            await (0, syncDuelStart_logic_1.startSyncDuelQuestionTx)({ tx, matchRef, match, nowMs });
        });
    }
    catch (e) {
        // Expected races are fine (another client/trigger already started).
        if (e instanceof https_1.HttpsError)
            return;
        return;
    }
});
