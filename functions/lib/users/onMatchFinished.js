"use strict";
/**
 * onMatchFinished Trigger
 *
 * Maç bittiğinde (ACTIVE -> FINISHED) tetiklenir.
 * - Oyunculara trophy/level/stats günceller
 * - League bucket'larındaki weeklyTrophies günceller
 * - Teneke Escape: İlk maçını kazananı Bronze'a atar
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchOnFinished = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("../utils/firestore");
const types_1 = require("./types");
const utils_1 = require("./utils");
const league_1 = require("../shared/types/league");
const assignToLeague_1 = require("../league/assignToLeague");
// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================
const WIN_BONUS = 25;
/** n-1 but never negative */
const decClamp = (n) => Math.max(0, Math.floor(n) - 1);
/** Safe number conversion: null/undefined -> 0, floor, clamp to 0 */
const safeNum = (val) => Math.max(0, Math.floor(Number(val ?? 0)));
/** Update a player's weeklyTrophies in bucket players array */
function updatePlayerInBucket(players, uid, delta) {
    return players.map((p) => p.uid === uid ? { ...p, weeklyTrophies: (p.weeklyTrophies || 0) + delta } : p);
}
// ============================================================================
// MAIN TRIGGER
// ============================================================================
exports.matchOnFinished = (0, firestore_1.onDocumentUpdated)("matches/{matchId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    // ONLY trigger on ACTIVE -> FINISHED
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
    // Track values for Teneke Escape (need to pass out of transaction)
    let winnerCurrentLeague = "Teneke";
    let loserCurrentLeague = "Teneke";
    let winnerNewWeeklyTrophies = 0;
    let loserNewWeeklyTrophies = 0;
    // ==================== TRANSACTION ====================
    await firestore_2.db.runTransaction(async (tx) => {
        const matchSnap = await tx.get(matchRef);
        const match = matchSnap.data();
        if (!match)
            return;
        // Idempotency: already processed
        if (match.progression?.phase1ProcessedAt)
            return;
        // Calculate deltas from match state
        const stateByUid = match.stateByUid ?? {};
        const winnerMatchKupa = safeNum(stateByUid[winnerUid]?.trophies);
        const loserMatchKupa = safeNum(stateByUid[loserUid]?.trophies);
        const winnerDelta = winnerMatchKupa + WIN_BONUS;
        const loserDelta = loserMatchKupa;
        // Read user documents
        const [winnerSnap, loserSnap] = await Promise.all([
            tx.get(winnerRef),
            tx.get(loserRef),
        ]);
        // If users don't exist, mark processed and skip
        if (!winnerSnap.exists || !loserSnap.exists) {
            tx.update(matchRef, { progression: { phase1ProcessedAt: firestore_2.FieldValue.serverTimestamp() } });
            return;
        }
        const winnerData = winnerSnap.data();
        const loserData = loserSnap.data();
        if (!winnerData || !loserData) {
            tx.update(matchRef, { progression: { phase1ProcessedAt: firestore_2.FieldValue.serverTimestamp() } });
            return;
        }
        // ========== READ BUCKET DOCUMENTS ==========
        const winnerBucketId = winnerData.league.currentBucketId || null;
        const loserBucketId = loserData.league.currentBucketId || null;
        let winnerBucketPlayers = null;
        let loserBucketPlayers = null;
        // Read winner's bucket
        if (winnerBucketId) {
            const snap = await tx.get(firestore_2.db.collection(league_1.LEAGUES_COLLECTION).doc(winnerBucketId));
            if (snap.exists) {
                winnerBucketPlayers = snap.data()?.players || [];
            }
        }
        // Read loser's bucket (or reuse if same)
        if (loserBucketId && loserBucketId !== winnerBucketId) {
            const snap = await tx.get(firestore_2.db.collection(league_1.LEAGUES_COLLECTION).doc(loserBucketId));
            if (snap.exists) {
                loserBucketPlayers = snap.data()?.players || [];
            }
        }
        else if (loserBucketId === winnerBucketId && winnerBucketPlayers) {
            loserBucketPlayers = winnerBucketPlayers; // Same bucket, reuse
        }
        // ========== CALCULATE NEW VALUES ==========
        const winnerOldTrophies = Number(winnerData.trophies ?? 0);
        const loserOldTrophies = Number(loserData.trophies ?? 0);
        const winnerNewTrophies = (0, utils_1.clampMin)(winnerOldTrophies + winnerDelta, 0);
        const loserNewTrophies = (0, utils_1.clampMin)(loserOldTrophies + loserDelta, 0);
        const winnerNewLevel = (0, utils_1.calcLevelFromTrophies)(winnerNewTrophies);
        const loserNewLevel = (0, utils_1.calcLevelFromTrophies)(loserNewTrophies);
        const winnerNewActive = decClamp(Number(winnerData.presence?.activeMatchCount ?? 0));
        const loserNewActive = decClamp(Number(loserData.presence?.activeMatchCount ?? 0));
        // Store for Teneke Escape (must be set before writes)
        winnerCurrentLeague = winnerData.league.currentLeague;
        loserCurrentLeague = loserData.league.currentLeague;
        winnerNewWeeklyTrophies = (winnerData.league.weeklyTrophies ?? 0) + winnerDelta;
        loserNewWeeklyTrophies = (loserData.league.weeklyTrophies ?? 0) + loserDelta;
        // ========== WRITES: UPDATE USER DOCUMENTS ==========
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
        // ========== WRITES: UPDATE BUCKET PLAYER ENTRIES ==========
        if (winnerBucketId && winnerBucketId === loserBucketId && winnerBucketPlayers) {
            // Case 1: Both players in same bucket - single update
            let updatedPlayers = updatePlayerInBucket(winnerBucketPlayers, winnerUid, winnerDelta);
            updatedPlayers = updatePlayerInBucket(updatedPlayers, loserUid, loserDelta);
            tx.update(firestore_2.db.collection(league_1.LEAGUES_COLLECTION).doc(winnerBucketId), {
                players: updatedPlayers,
                updatedAt: firestore_2.FieldValue.serverTimestamp(),
            });
        }
        else {
            // Case 2: Different buckets - update separately
            if (winnerBucketId && winnerBucketPlayers) {
                tx.update(firestore_2.db.collection(league_1.LEAGUES_COLLECTION).doc(winnerBucketId), {
                    players: updatePlayerInBucket(winnerBucketPlayers, winnerUid, winnerDelta),
                    updatedAt: firestore_2.FieldValue.serverTimestamp(),
                });
            }
            if (loserBucketId && loserBucketPlayers) {
                tx.update(firestore_2.db.collection(league_1.LEAGUES_COLLECTION).doc(loserBucketId), {
                    players: updatePlayerInBucket(loserBucketPlayers, loserUid, loserDelta),
                    updatedAt: firestore_2.FieldValue.serverTimestamp(),
                });
            }
        }
        // Mark as processed
        tx.update(matchRef, { progression: { phase1ProcessedAt: firestore_2.FieldValue.serverTimestamp() } });
    });
    // ==================== TENEKE ESCAPE (POST-TRANSACTION) ====================
    // Get current season ID from league meta
    const metaSnap = await firestore_2.db.collection(league_1.SYSTEM_COLLECTION).doc(league_1.LEAGUE_META_DOC_ID).get();
    let seasonId = "S1"; // Default fallback
    if (metaSnap.exists) {
        const meta = league_1.LeagueMetaSchema.safeParse(metaSnap.data());
        if (meta.success) {
            seasonId = meta.data.currentSeasonId;
        }
    }
    // Check winner for Teneke Escape
    if (winnerCurrentLeague === "Teneke" && winnerNewWeeklyTrophies > 0) {
        try {
            console.log(`[Teneke Escape] Assigning winner ${winnerUid} to Bronze (weeklyTrophies: ${winnerNewWeeklyTrophies})`);
            const result = await (0, assignToLeague_1.assignToLeague)({ uid: winnerUid, seasonId });
            console.log(`[Teneke Escape] Winner ${winnerUid} assigned to ${result.tier} (bucketId: ${result.bucketId})`);
        }
        catch (error) {
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
    if (loserCurrentLeague === "Teneke" && loserNewWeeklyTrophies > 0) {
        try {
            console.log(`[Teneke Escape] Assigning loser ${loserUid} to Bronze (weeklyTrophies: ${loserNewWeeklyTrophies})`);
            const result = await (0, assignToLeague_1.assignToLeague)({ uid: loserUid, seasonId });
            console.log(`[Teneke Escape] Loser ${loserUid} assigned to ${result.tier} (bucketId: ${result.bucketId})`);
        }
        catch (error) {
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
