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
const constants_1 = require("../shared/constants");
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
/**
 * Calculate category stats updates from earned symbols (async duel).
 * Her kazanılan symbol = 2 doğru cevap (Q1 + Q2).
 * Returns Firestore update object for categoryStats.
 */
function buildCategoryStatsUpdateFromSymbols(symbols) {
    const updates = {};
    for (const symbol of symbols) {
        // Her symbol için 2 doğru cevap (Q1 ve Q2'yi geçti)
        updates[`categoryStats.${symbol}.correct`] = firestore_2.FieldValue.increment(2);
        updates[`categoryStats.${symbol}.total`] = firestore_2.FieldValue.increment(2);
    }
    return updates;
}
/**
 * Calculate category stats updates from round wins (sync duel).
 * Her round win = 1 doğru cevap (tek soru var her round'da).
 * Returns Firestore update object for categoryStats.
 */
function buildCategoryStatsUpdateFromRoundWins(category, roundWins) {
    const updates = {};
    if (!category)
        return updates; // Category yoksa skip
    // Her round win = 1 doğru cevap (tek soru var her round'da)
    updates[`categoryStats.${category}.correct`] = firestore_2.FieldValue.increment(roundWins);
    // Total: Her round'da soru cevaplandı (round sayısı kadar total)
    // Not: Bu bilgiyi syncDuel'de tutmuyoruz, şimdilik roundWins kadar total ekliyoruz
    updates[`categoryStats.${category}.total`] = firestore_2.FieldValue.increment(roundWins);
    return updates;
}
// ============================================================================
// MAIN TRIGGER
// ============================================================================
exports.matchOnFinished = (0, firestore_1.onDocumentUpdated)({
    document: "matches/{matchId}",
    region: constants_1.FUNCTIONS_REGION,
}, async (event) => {
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
    let winnerIsBot = false;
    let loserIsBot = false;
    // ==================== TRANSACTION ====================
    await firestore_2.db.runTransaction(async (tx) => {
        const matchSnap = await tx.get(matchRef);
        const match = matchSnap.data();
        if (!match)
            return;
        // Idempotency: already processed
        if (match.progression?.phase1ProcessedAt)
            return;
        // Check if players are bots
        const playerTypes = match.playerTypes ?? {};
        winnerIsBot = playerTypes[winnerUid] === "BOT";
        loserIsBot = playerTypes[loserUid] === "BOT";
        // Calculate deltas from match state (sync duel vs async duel)
        const stateByUid = match.stateByUid ?? {};
        let winnerDelta;
        let loserDelta;
        let matchCategory = null; // For category stats
        if (match.mode === "SYNC_DUEL" && match.syncDuel) {
            // Sync duel: question-based trophy calculation (async duel mantığıyla aynı)
            // Her doğru cevap için stateByUid[uid].trophies'e eklenen kupa + zafer bonusu
            const winnerMatchKupa = safeNum(stateByUid[winnerUid]?.trophies);
            const loserMatchKupa = safeNum(stateByUid[loserUid]?.trophies);
            winnerDelta = winnerMatchKupa + WIN_BONUS;
            loserDelta = loserMatchKupa;
            matchCategory = match.syncDuel.category ?? null;
        }
        else {
            // Async duel (deprecated, backward compatibility için tutuluyor)
            const winnerMatchKupa = safeNum(stateByUid[winnerUid]?.trophies);
            const loserMatchKupa = safeNum(stateByUid[loserUid]?.trophies);
            winnerDelta = winnerMatchKupa + WIN_BONUS;
            loserDelta = loserMatchKupa;
        }
        // Read user documents (only for humans)
        const winnerSnap = winnerIsBot ? null : await tx.get(winnerRef);
        const loserSnap = loserIsBot ? null : await tx.get(loserRef);
        // If human users don't exist, mark processed and skip
        if ((!winnerIsBot && !winnerSnap?.exists) || (!loserIsBot && !loserSnap?.exists)) {
            tx.update(matchRef, { progression: { phase1ProcessedAt: firestore_2.FieldValue.serverTimestamp() } });
            return;
        }
        const winnerData = winnerSnap?.data();
        const loserData = loserSnap?.data();
        if ((!winnerIsBot && !winnerData) || (!loserIsBot && !loserData)) {
            tx.update(matchRef, { progression: { phase1ProcessedAt: firestore_2.FieldValue.serverTimestamp() } });
            return;
        }
        // ========== READ BUCKET DOCUMENTS (only for humans) ==========
        const winnerBucketId = winnerIsBot ? null : (winnerData?.league.currentBucketId || null);
        const loserBucketId = loserIsBot ? null : (loserData?.league.currentBucketId || null);
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
        // ========== CALCULATE NEW VALUES (only for humans) ==========
        const winnerOldTrophies = winnerIsBot ? 0 : Number(winnerData?.trophies ?? 0);
        const loserOldTrophies = loserIsBot ? 0 : Number(loserData?.trophies ?? 0);
        const winnerNewTrophies = (0, utils_1.clampMin)(winnerOldTrophies + winnerDelta, 0);
        const loserNewTrophies = (0, utils_1.clampMin)(loserOldTrophies + loserDelta, 0);
        const winnerNewLevel = (0, utils_1.calcLevelFromTrophies)(winnerNewTrophies);
        const loserNewLevel = (0, utils_1.calcLevelFromTrophies)(loserNewTrophies);
        const winnerNewActive = winnerIsBot ? 0 : decClamp(Number(winnerData?.presence?.activeMatchCount ?? 0));
        const loserNewActive = loserIsBot ? 0 : decClamp(Number(loserData?.presence?.activeMatchCount ?? 0));
        // Store for Teneke Escape (must be set before writes, only for humans)
        winnerCurrentLeague = winnerIsBot ? "BOT" : (winnerData?.league.currentLeague ?? "Teneke");
        loserCurrentLeague = loserIsBot ? "BOT" : (loserData?.league.currentLeague ?? "Teneke");
        winnerNewWeeklyTrophies = winnerIsBot ? 0 : ((winnerData?.league.weeklyTrophies ?? 0) + winnerDelta);
        loserNewWeeklyTrophies = loserIsBot ? 0 : ((loserData?.league.weeklyTrophies ?? 0) + loserDelta);
        // ========== WRITES: UPDATE USER DOCUMENTS ==========
        // Build category stats updates (sync duel vs async duel)
        let winnerCategoryStats = {};
        let loserCategoryStats = {};
        if (match.mode === "SYNC_DUEL" && match.syncDuel) {
            // Sync duel: round wins bazlı category stats
            const roundWins = match.syncDuel.roundWins ?? {};
            const winnerRoundWins = safeNum(roundWins[winnerUid]);
            const loserRoundWins = safeNum(roundWins[loserUid]);
            winnerCategoryStats = buildCategoryStatsUpdateFromRoundWins(matchCategory, winnerRoundWins);
            loserCategoryStats = buildCategoryStatsUpdateFromRoundWins(matchCategory, loserRoundWins);
        }
        else {
            // Async duel: symbols bazlı category stats
            const winnerSymbols = (stateByUid[winnerUid]?.symbols ?? []);
            const loserSymbols = (stateByUid[loserUid]?.symbols ?? []);
            winnerCategoryStats = buildCategoryStatsUpdateFromSymbols(winnerSymbols);
            loserCategoryStats = buildCategoryStatsUpdateFromSymbols(loserSymbols);
        }
        if (!winnerIsBot) {
            tx.update(winnerRef, {
                trophies: winnerNewTrophies,
                level: winnerNewLevel,
                "stats.totalMatches": firestore_2.FieldValue.increment(1),
                "stats.totalWins": firestore_2.FieldValue.increment(1),
                "league.weeklyTrophies": firestore_2.FieldValue.increment(winnerDelta),
                "presence.activeMatchCount": winnerNewActive,
                ...winnerCategoryStats,
            });
        }
        if (!loserIsBot) {
            tx.update(loserRef, {
                trophies: loserNewTrophies,
                level: loserNewLevel,
                "stats.totalMatches": firestore_2.FieldValue.increment(1),
                "league.weeklyTrophies": firestore_2.FieldValue.increment(loserDelta),
                "presence.activeMatchCount": loserNewActive,
                ...loserCategoryStats,
            });
        }
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
    // Check winner for Teneke Escape (skip bots)
    if (!winnerIsBot && winnerCurrentLeague === "Teneke" && winnerNewWeeklyTrophies > 0) {
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
    else if (!winnerIsBot) {
        console.log(`[Teneke Escape] Winner ${winnerUid} skip: currentLeague=${winnerCurrentLeague}, weeklyTrophies=${winnerNewWeeklyTrophies}`);
    }
    // Check loser for Teneke Escape (skip bots)
    if (!loserIsBot && loserCurrentLeague === "Teneke" && loserNewWeeklyTrophies > 0) {
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
    else if (!loserIsBot) {
        console.log(`[Teneke Escape] Loser ${loserUid} skip: currentLeague=${loserCurrentLeague}, weeklyTrophies=${loserNewWeeklyTrophies}`);
    }
});
