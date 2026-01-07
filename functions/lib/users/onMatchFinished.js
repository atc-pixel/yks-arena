"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchOnFinished = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("../utils/firestore");
const types_1 = require("./types");
const utils_1 = require("./utils");
const league_1 = require("../shared/types/league");
const assignToLeague_1 = require("../league/assignToLeague");
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
    // Variables to store computed values from transaction
    let winnerCurrentLeague = "Teneke";
    let loserCurrentLeague = "Teneke";
    let winnerNewWeeklyTrophies = 0;
    let loserNewWeeklyTrophies = 0;
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
        // Store computed values for use after transaction (before updates)
        winnerCurrentLeague = winnerData.league.currentLeague;
        loserCurrentLeague = loserData.league.currentLeague;
        winnerNewWeeklyTrophies = (winnerData.league.weeklyTrophies ?? 0) + winnerDelta;
        loserNewWeeklyTrophies = (loserData.league.weeklyTrophies ?? 0) + loserDelta;
        tx.update(winnerRef, {
            trophies: winnerNewTrophies,
            level: winnerNewLevel,
            "stats.totalMatches": firestore_2.FieldValue.increment(1),
            "stats.totalWins": firestore_2.FieldValue.increment(1),
            "league.weeklyTrophies": firestore_2.FieldValue.increment(winnerDelta),
            "presence.activeMatchCount": winnerNewActive,
        });
        tx.update(loserRef, {
            trophies: loserNewTrophies,
            level: loserNewLevel,
            "stats.totalMatches": firestore_2.FieldValue.increment(1),
            "league.weeklyTrophies": firestore_2.FieldValue.increment(loserDelta),
            "presence.activeMatchCount": loserNewActive,
        });
        tx.update(matchRef, {
            progression: { phase1ProcessedAt: firestore_2.FieldValue.serverTimestamp() },
        });
    });
    // After transaction: Check for Teneke Escape
    // If user is in Teneke and has weeklyTrophies > 0, assign to Bronze
    // Use computed values from transaction to avoid eventual consistency issues
    // Get current season ID from league meta
    const metaRef = firestore_2.db.collection(league_1.SYSTEM_COLLECTION).doc(league_1.LEAGUE_META_DOC_ID);
    const metaSnap = await metaRef.get();
    let seasonId = "S1"; // Default fallback
    if (metaSnap.exists) {
        const metaData = metaSnap.data();
        const meta = league_1.LeagueMetaSchema.safeParse(metaData);
        if (meta.success) {
            seasonId = meta.data.currentSeasonId;
        }
    }
    // Check winner for Teneke Escape
    // Use computed values from transaction to avoid eventual consistency issues
    if (winnerCurrentLeague === "Teneke" &&
        winnerNewWeeklyTrophies > 0) {
        try {
            console.log(`[Teneke Escape] Assigning winner ${winnerUid} to Bronze (weeklyTrophies: ${winnerNewWeeklyTrophies})`);
            const result = await (0, assignToLeague_1.assignToLeague)({
                uid: winnerUid,
                seasonId,
                // targetTier not provided, will auto-determine (Teneke Escape -> Bronze)
            });
            console.log(`[Teneke Escape] Winner ${winnerUid} assigned to ${result.tier} (bucketId: ${result.bucketId})`);
        }
        catch (error) {
            // Log error but don't fail the match processing
            console.error(`[Teneke Escape] Failed to assign winner ${winnerUid} to league:`, error);
            if (error instanceof Error) {
                console.error(`[Teneke Escape] Error stack:`, error.stack);
            }
        }
    }
    else {
        console.log(`[Teneke Escape] Winner ${winnerUid} skip: currentLeague=${winnerCurrentLeague}, weeklyTrophies=${winnerNewWeeklyTrophies}`);
    }
    // Check loser for Teneke Escape
    // Use computed values from transaction to avoid eventual consistency issues
    if (loserCurrentLeague === "Teneke" &&
        loserNewWeeklyTrophies > 0) {
        try {
            console.log(`[Teneke Escape] Assigning loser ${loserUid} to Bronze (weeklyTrophies: ${loserNewWeeklyTrophies})`);
            const result = await (0, assignToLeague_1.assignToLeague)({
                uid: loserUid,
                seasonId,
                // targetTier not provided, will auto-determine (Teneke Escape -> Bronze)
            });
            console.log(`[Teneke Escape] Loser ${loserUid} assigned to ${result.tier} (bucketId: ${result.bucketId})`);
        }
        catch (error) {
            // Log error but don't fail the match processing
            console.error(`[Teneke Escape] Failed to assign loser ${loserUid} to league:`, error);
            if (error instanceof Error) {
                console.error(`[Teneke Escape] Error stack:`, error.stack);
            }
        }
    }
    else {
        console.log(`[Teneke Escape] Loser ${loserUid} skip: currentLeague=${loserCurrentLeague}, weeklyTrophies=${loserNewWeeklyTrophies}`);
    }
});
