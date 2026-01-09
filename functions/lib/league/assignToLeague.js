"use strict";
/**
 * Assign User to League Bucket
 *
 * Pseudo-code implementation for assigning a user to an appropriate league bucket.
 *
 * Architecture Decision:
 * - Transaction-based: Atomic bucket assignment with meta update
 * - Teneke Escape: If user has weeklyTrophies > 0 and is in Teneke, move to Bronze
 * - Bucket Selection: Find open bucket (< 30 players) or create new one
 * - Validation: All Firestore reads validated with Zod schemas
 *
 * Trigger: Called from onMatchFinished when user.weeklyTrophies > 0 && user.league === 'Teneke'
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignToLeague = assignToLeague;
const firestore_1 = require("../utils/firestore");
const league_1 = require("../shared/types/league");
const types_1 = require("../users/types");
// ============================================================================
// MAIN FUNCTION
// ============================================================================
/**
 * Assign User to League Bucket
 *
 * Pseudo-code Flow:
 *
 * 1. TRANSACTION START
 *
 * 2. Read user document (users/{uid})
 *    - Validate with UserDoc schema
 *    - Check user.league.currentLeague
 *    - Check user.league.weeklyTrophies
 *
 * 3. Determine Target Tier:
 *    - If user.league.currentLeague === 'Teneke' AND user.league.weeklyTrophies > 0:
 *      → targetTier = 'Bronze' (Teneke Escape)
 *    - Else if targetTier provided:
 *      → Use provided targetTier
 *    - Else:
 *      → Use user.league.currentLeague (no change)
 *
 * 4. If targetTier === 'Teneke':
 *    - Teneke is infinite pool, no bucket assignment needed
 *    - Update user.league.currentLeague = 'Teneke' (if not already)
 *    - RETURN (no bucket assignment)
 *
 * 5. Find or Create Bucket:
 *    - Call findOpenBucket(tier, seasonId)
 *    - If found: use existing bucketId
 *    - If not found: call createNewBucket(tier, seasonId)
 *
 * 6. Read target bucket (leagues/{bucketId})
 *    - Validate with LeagueBucketSchema
 *    - Check capacity: players.length < 30
 *    - If full: ERROR (should not happen if findOpenBucket worked correctly)
 *
 * 7. Check if user already in bucket:
 *    - If players array contains uid: RETURN (already assigned)
 *
 * 8. Remove user from old bucket (if exists):
 *    - Query leagues collection for user's current bucket
 *    - If found: Remove user from old bucket's players array
 *    - Update old bucket's status if needed
 *
 * 9. Create LeaguePlayerEntry:
 *    - uid: user.uid
 *    - weeklyTrophies: user.league.weeklyTrophies
 *    - totalTrophies: user.trophies
 *    - joinedAt: Timestamp.now()
 *
 * 10. Add player to bucket:
 *    - Update leagues/{bucketId}.players: FieldValue.arrayUnion(playerEntry)
 *    - Update leagues/{bucketId}.updatedAt: FieldValue.serverTimestamp()
 *    - If players.length === 30: Update status to 'full'
 *
 * 11. Update league meta:
 *     - Call updateLeagueMeta(tier, bucketId)
 *
 * 12. Update user document:
 *     - Update users/{uid}.league.currentLeague = targetTier
 *     - (Note: weeklyTrophies is updated in onMatchFinished, not here)
 *
 * 12. TRANSACTION COMMIT
 *
 * Error Handling:
 * - If transaction fails: Retry logic (Firestore handles retries automatically)
 * - If user not found: Throw error
 * - If bucket full: Throw error (should not happen)
 * - If invalid tier: Throw error (Zod validation)
 */
async function assignToLeague(params) {
    const { uid, seasonId, targetTier: providedTargetTier } = params;
    return await firestore_1.db.runTransaction(async (tx) => {
        // ============================================================================
        // PHASE 1: ALL READS FIRST (Firestore transaction requirement)
        // ============================================================================
        // 1. Read user document
        const userRef = firestore_1.db.collection(types_1.USER_COLLECTION).doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
            throw new Error(`User ${uid} not found`);
        }
        const userData = userSnap.data();
        const currentBucketId = userData.league.currentBucketId || null;
        // 2. Read old bucket (if exists) - for removal
        let oldBucketSnap = null;
        let oldBucketData = undefined;
        if (currentBucketId) {
            const oldBucketRef = firestore_1.db.collection(league_1.LEAGUES_COLLECTION).doc(currentBucketId);
            oldBucketSnap = await tx.get(oldBucketRef);
            if (oldBucketSnap.exists) {
                oldBucketData = oldBucketSnap.data();
            }
        }
        // 3. Determine target tier
        let targetTier;
        if (providedTargetTier) {
            targetTier = league_1.LeagueTierSchema.parse(providedTargetTier);
        }
        else {
            const currentLeague = userData.league.currentLeague;
            const weeklyTrophies = userData.league.weeklyTrophies;
            if (currentLeague === "Teneke" && weeklyTrophies > 0) {
                targetTier = "Bronze";
            }
            else {
                const tierMap = {
                    Teneke: "Teneke",
                    BRONZE: "Bronze",
                    SILVER: "Silver",
                    GOLD: "Gold",
                    PLATINUM: "Platinum",
                    DIAMOND: "Diamond",
                };
                targetTier = tierMap[currentLeague] || "Teneke";
            }
        }
        // 4. Read league meta (for findOpenBucket)
        const metaRef = firestore_1.db.collection(league_1.SYSTEM_COLLECTION).doc(league_1.LEAGUE_META_DOC_ID);
        const metaSnap = await tx.get(metaRef);
        let metaData = undefined;
        if (metaSnap.exists) {
            metaData = metaSnap.data();
        }
        // 5. Find or determine bucket ID (read phase)
        let bucketId = null;
        let bucketSnap = null;
        let bucketData = undefined;
        if (targetTier !== "Teneke") {
            // Try to find open bucket from meta
            if (metaData) {
                const openBuckets = metaData.openBuckets?.[targetTier] || [];
                for (const candidateBucketId of openBuckets) {
                    const candidateRef = firestore_1.db.collection(league_1.LEAGUES_COLLECTION).doc(candidateBucketId);
                    const candidateSnap = await tx.get(candidateRef);
                    if (candidateSnap.exists) {
                        const candidateData = candidateSnap.data();
                        const candidateBucket = league_1.LeagueBucketSchema.safeParse(candidateData);
                        if (candidateBucket.success &&
                            candidateBucket.data.seasonId === seasonId &&
                            candidateBucket.data.status === "active" &&
                            candidateBucket.data.players.length < 30) {
                            bucketId = candidateBucketId;
                            bucketSnap = candidateSnap;
                            bucketData = candidateData;
                            break;
                        }
                    }
                }
            }
            // If no open bucket found, we'll create one (but read first to determine bucket number)
            if (!bucketId) {
                // Determine next bucket number from meta
                let bucketNumber = 1;
                if (metaData) {
                    const existingBuckets = metaData.openBuckets?.[targetTier] || [];
                    let maxBucketNumber = 0;
                    for (const existingBucketId of existingBuckets) {
                        const parsed = existingBucketId.split("_");
                        if (parsed.length === 3 && parsed[1] === seasonId) {
                            const num = parseInt(parsed[2], 10);
                            if (!isNaN(num) && num > maxBucketNumber) {
                                maxBucketNumber = num;
                            }
                        }
                    }
                    bucketNumber = maxBucketNumber + 1;
                }
                // Generate bucket ID (we'll create it in write phase)
                // Format: {tier}_{seasonId}_{bucketNumber} (e.g., bronze_S1_1)
                bucketId = `${targetTier.toLowerCase()}_${seasonId}_${bucketNumber}`;
            }
            else {
                // Read bucket data (already read above)
                bucketData = bucketSnap.data();
            }
        }
        // ============================================================================
        // PHASE 2: ALL WRITES AFTER ALL READS
        // ============================================================================
        // 6. Remove user from old bucket (if exists)
        if (oldBucketSnap && oldBucketSnap.exists && oldBucketData !== undefined) {
            const oldBucket = league_1.LeagueBucketSchema.safeParse(oldBucketData);
            if (oldBucket.success) {
                const playerIndex = oldBucket.data.players.findIndex((p) => p.uid === uid);
                if (playerIndex !== -1) {
                    const updatedPlayers = oldBucket.data.players.filter((p) => p.uid !== uid);
                    const oldBucketRef = firestore_1.db.collection(league_1.LEAGUES_COLLECTION).doc(currentBucketId);
                    const oldBucketUpdates = {
                        players: updatedPlayers,
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    };
                    if (oldBucket.data.status === "full" && updatedPlayers.length < 30) {
                        oldBucketUpdates.status = "active";
                    }
                    tx.update(oldBucketRef, oldBucketUpdates);
                }
            }
        }
        // 7. If Teneke, no bucket assignment needed
        if (targetTier === "Teneke") {
            tx.update(userRef, {
                "league.currentLeague": "Teneke",
                "league.currentBucketId": firestore_1.FieldValue.delete(),
            });
            return { bucketId: "", tier: "Teneke" };
        }
        // 8. Create new bucket if needed
        if (!bucketSnap || !bucketSnap.exists) {
            const bucketRef = firestore_1.db.collection(league_1.LEAGUES_COLLECTION).doc(bucketId);
            const now = firestore_1.Timestamp.now();
            const newBucket = {
                tier: targetTier,
                seasonId,
                bucketNumber: parseInt(bucketId.split("_")[2] || "1", 10),
                status: "active",
                players: [],
                createdAt: now,
                updatedAt: now,
            };
            tx.create(bucketRef, newBucket);
            bucketData = newBucket;
        }
        // 9. Validate bucket data
        const bucket = league_1.LeagueBucketSchema.parse(bucketData);
        // 10. Check capacity
        if (bucket.players.length >= 30) {
            throw new Error(`Bucket ${bucketId} is full`);
        }
        // 11. Check if user already in bucket
        const existingPlayer = bucket.players.find((p) => p.uid === uid);
        if (existingPlayer) {
            return { bucketId: bucketId, tier: targetTier };
        }
        // 12. Create player entry
        const playerEntry = {
            uid,
            weeklyTrophies: userData.league.weeklyTrophies,
            totalTrophies: userData.trophies,
            joinedAt: firestore_1.Timestamp.now(),
        };
        league_1.LeaguePlayerEntrySchema.parse(playerEntry);
        // 13. Add player to bucket
        const bucketRef = firestore_1.db.collection(league_1.LEAGUES_COLLECTION).doc(bucketId);
        const newPlayersCount = bucket.players.length + 1;
        const updates = {
            players: firestore_1.FieldValue.arrayUnion(playerEntry),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        if (newPlayersCount >= 30) {
            updates.status = "full";
        }
        tx.update(bucketRef, updates);
        // 14. Update league meta
        if (!metaSnap.exists) {
            const now = firestore_1.Timestamp.now();
            const newMeta = {
                openBuckets: {
                    Teneke: [],
                    Bronze: [bucketId],
                    Silver: [],
                    Gold: [],
                    Platinum: [],
                    Diamond: [],
                },
                currentSeasonId: seasonId,
                lastResetAt: null,
                updatedAt: now,
            };
            tx.create(metaRef, newMeta);
        }
        else {
            const currentOpenBuckets = metaData.openBuckets?.[targetTier] || [];
            if (!currentOpenBuckets.includes(bucketId)) {
                currentOpenBuckets.push(bucketId);
            }
            tx.update(metaRef, {
                [`openBuckets.${targetTier}`]: currentOpenBuckets,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        // 15. Update user document
        const tierToLeagueName = {
            Teneke: "Teneke",
            Bronze: "BRONZE",
            Silver: "SILVER",
            Gold: "GOLD",
            Platinum: "PLATINUM",
            Diamond: "DIAMOND",
        };
        tx.update(userRef, {
            "league.currentLeague": tierToLeagueName[targetTier],
            "league.currentBucketId": bucketId,
        });
        return { bucketId: bucketId, tier: targetTier };
    });
}
