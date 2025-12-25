"use strict";
// functions/src/users/onMatchFinished.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchOnFinished = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("../utils/firestore");
const types_1 = require("./types");
const utils_1 = require("./utils");
function computeTrophyDeltaFromMatchKupa(params) {
    const { isWinner, myMatchKupa } = params;
    const kupa = Math.max(0, Math.floor(myMatchKupa || 0));
    if (isWinner) {
        // Winner: 25..32 (kupa 0..21 -> bonus 0..7)
        const bonus = Math.min(7, Math.floor(kupa / 3));
        return 25 + bonus; // 25..32
    }
    // Loser: -2..+5 (kupa 0..21 -> -2..+5)
    const value = -2 + Math.min(7, Math.floor(kupa / 3)); // -2..+5 (cap)
    return Math.min(5, value);
}
exports.matchOnFinished = (0, firestore_1.onDocumentUpdated)("matches/{matchId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    // ONLY on ACTIVE -> FINISHED
    if (!(before.status === "ACTIVE" && after.status === "FINISHED"))
        return;
    const matchId = event.params.matchId;
    const winnerUid = after.winnerUid;
    const players = after.players ?? [];
    if (!winnerUid)
        return;
    if (!players.length)
        return;
    // 1v1 assumption (current engine)
    const loserUid = players.find((p) => p !== winnerUid);
    if (!loserUid)
        return;
    const matchRef = event.data.after.ref;
    const winnerRef = firestore_2.db.collection(types_1.USER_COLLECTION).doc(winnerUid);
    const loserRef = firestore_2.db.collection(types_1.USER_COLLECTION).doc(loserUid);
    await firestore_2.db.runTransaction(async (tx) => {
        // Re-read match inside txn for idempotency
        const matchSnap = await tx.get(matchRef);
        const match = matchSnap.data();
        if (!match)
            return;
        // If already processed, bail out (retry safe)
        if (match.progression?.phase1ProcessedAt)
            return;
        const stateByUid = match.stateByUid ?? {};
        const winnerState = stateByUid[winnerUid] ?? {};
        const loserState = stateByUid[loserUid] ?? {};
        const winnerMatchKupa = Number(winnerState.trophies ?? 0);
        const loserMatchKupa = Number(loserState.trophies ?? 0);
        const winnerDelta = computeTrophyDeltaFromMatchKupa({
            isWinner: true,
            myMatchKupa: winnerMatchKupa,
        });
        const loserDelta = computeTrophyDeltaFromMatchKupa({
            isWinner: false,
            myMatchKupa: loserMatchKupa,
        });
        // Fetch user docs to compute new totals + level
        const [winnerSnap, loserSnap] = await Promise.all([
            tx.get(winnerRef),
            tx.get(loserRef),
        ]);
        if (!winnerSnap.exists || !loserSnap.exists) {
            // If user doc missing, mark match processed to avoid infinite retries
            tx.update(matchRef, {
                progression: { phase1ProcessedAt: firestore_2.FieldValue.serverTimestamp() },
            });
            return;
        }
        const winnerData = winnerSnap.data();
        const loserData = loserSnap.data();
        const winnerOldTrophies = Number(winnerData.trophies ?? 0);
        const loserOldTrophies = Number(loserData.trophies ?? 0);
        const winnerNewTrophies = (0, utils_1.clampMin)(winnerOldTrophies + winnerDelta, 0);
        const loserNewTrophies = (0, utils_1.clampMin)(loserOldTrophies + loserDelta, 0);
        const winnerNewLevel = (0, utils_1.calcLevelFromTrophies)(winnerNewTrophies);
        const loserNewLevel = (0, utils_1.calcLevelFromTrophies)(loserNewTrophies);
        // Winner updates
        tx.update(winnerRef, {
            trophies: winnerNewTrophies,
            level: winnerNewLevel,
            "stats.totalMatches": firestore_2.FieldValue.increment(1),
            "stats.totalWins": firestore_2.FieldValue.increment(1),
            "league.weeklyScore": firestore_2.FieldValue.increment(winnerDelta), // weekly competition for Phase 3
        });
        // Loser updates
        tx.update(loserRef, {
            trophies: loserNewTrophies,
            level: loserNewLevel,
            "stats.totalMatches": firestore_2.FieldValue.increment(1),
            "league.weeklyScore": firestore_2.FieldValue.increment(loserDelta),
        });
        // Mark match processed (idempotency)
        tx.update(matchRef, {
            progression: { phase1ProcessedAt: firestore_2.FieldValue.serverTimestamp() },
        });
    });
});
