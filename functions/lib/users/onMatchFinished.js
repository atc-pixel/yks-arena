"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchOnFinished = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("../utils/firestore");
const types_1 = require("./types");
const utils_1 = require("./utils");
// Progression settlement: transfer match-earned trophies to user profile.
// Winner gets an additional fixed bonus.
const WIN_BONUS = 25;
function decClamp(n) {
    return Math.max(0, Math.floor(n) - 1);
}
exports.matchOnFinished = (0, firestore_1.onDocumentUpdated)("matches/{matchId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    // ONLY ACTIVE -> FINISHED
    if (!(before.status === "ACTIVE" && after.status === "FINISHED"))
        return;
    const matchRef = event.data.after.ref;
    const players = after.players ?? [];
    if (players.length !== 2)
        return;
    const winnerUid = after.winnerUid ?? null;
    if (!winnerUid)
        return;
    const loserUid = players.find((p) => p !== winnerUid) ?? null;
    if (!loserUid)
        return;
    const winnerRef = firestore_2.db.collection(types_1.USER_COLLECTION).doc(winnerUid);
    const loserRef = firestore_2.db.collection(types_1.USER_COLLECTION).doc(loserUid);
    await firestore_2.db.runTransaction(async (tx) => {
        const snap = await tx.get(matchRef);
        const match = snap.data();
        if (!match)
            return;
        // idempotency
        if (match.progression?.phase1ProcessedAt)
            return;
        const stateByUid = match.stateByUid ?? {};
        const winnerState = stateByUid[winnerUid] ?? {};
        const loserState = stateByUid[loserUid] ?? {};
        const winnerMatchKupa = Math.max(0, Math.floor(Number(winnerState.trophies ?? 0)));
        const loserMatchKupa = Math.max(0, Math.floor(Number(loserState.trophies ?? 0)));
        // Transfer rule:
        // - everyone keeps the trophies they earned inside the match
        // - winner also gets a win bonus
        const winnerDelta = winnerMatchKupa + WIN_BONUS;
        const loserDelta = loserMatchKupa;
        const [winnerSnap, loserSnap] = await Promise.all([
            tx.get(winnerRef),
            tx.get(loserRef),
        ]);
        if (!winnerSnap.exists || !loserSnap.exists) {
            tx.update(matchRef, {
                progression: { phase1ProcessedAt: firestore_2.FieldValue.serverTimestamp() },
            });
            return;
        }
        const winnerData = winnerSnap.data();
        const loserData = loserSnap.data();
        if (!winnerData || !loserData) {
            // User data missing, mark as processed and skip
            tx.update(matchRef, {
                progression: { phase1ProcessedAt: firestore_2.FieldValue.serverTimestamp() },
            });
            return;
        }
        // trophies -> level
        const winnerOldTrophies = Number(winnerData.trophies ?? 0);
        const loserOldTrophies = Number(loserData.trophies ?? 0);
        const winnerNewTrophies = (0, utils_1.clampMin)(winnerOldTrophies + winnerDelta, 0);
        const loserNewTrophies = (0, utils_1.clampMin)(loserOldTrophies + loserDelta, 0);
        const winnerNewLevel = (0, utils_1.calcLevelFromTrophies)(winnerNewTrophies);
        const loserNewLevel = (0, utils_1.calcLevelFromTrophies)(loserNewTrophies);
        // activeMatchCount clamp (never negative)
        const winnerOldActive = Number(winnerData?.presence?.activeMatchCount ?? 0);
        const loserOldActive = Number(loserData?.presence?.activeMatchCount ?? 0);
        const winnerNewActive = decClamp(winnerOldActive);
        const loserNewActive = decClamp(loserOldActive);
        tx.update(winnerRef, {
            trophies: winnerNewTrophies,
            level: winnerNewLevel,
            "stats.totalMatches": firestore_2.FieldValue.increment(1),
            "stats.totalWins": firestore_2.FieldValue.increment(1),
            "league.weeklyScore": firestore_2.FieldValue.increment(winnerDelta),
            "presence.activeMatchCount": winnerNewActive,
        });
        tx.update(loserRef, {
            trophies: loserNewTrophies,
            level: loserNewLevel,
            "stats.totalMatches": firestore_2.FieldValue.increment(1),
            "league.weeklyScore": firestore_2.FieldValue.increment(loserDelta),
            "presence.activeMatchCount": loserNewActive,
        });
        tx.update(matchRef, {
            progression: { phase1ProcessedAt: firestore_2.FieldValue.serverTimestamp() },
        });
    });
});
