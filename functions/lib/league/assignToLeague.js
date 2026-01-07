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
const assignToLeague_helpers_1 = require("./assignToLeague.helpers");
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
        // 1. Read user document
        const userRef = firestore_1.db.collection(types_1.USER_COLLECTION).doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
            throw new Error(`User ${uid} not found`);
        }
        const userData = userSnap.data();
        // Note: UserDoc validation should happen at API boundary, not here
        // But we can add runtime checks if needed
        // Refactor: Optimized for O(1) lookup and idempotency
        // Get currentBucketId from user document to avoid O(N) scan
        const currentBucketId = userData.league.currentBucketId || null;
        // 2. Remove user from old bucket BEFORE any new assignment
        // This fixes the Zombie Player Bug: users moving to Teneke must be removed from old bucket
        if (currentBucketId) {
            await (0, assignToLeague_helpers_1.removeUserFromOldBucket)(tx, uid, currentBucketId);
        }
        // 3. Determine target tier
        let targetTier;
        if (providedTargetTier) {
            // Explicit tier provided (e.g., from weeklyReset promotion/demotion)
            targetTier = league_1.LeagueTierSchema.parse(providedTargetTier);
        }
        else {
            // Auto-determine: Teneke Escape logic
            const currentLeague = userData.league.currentLeague;
            const weeklyTrophies = userData.league.weeklyTrophies;
            if (currentLeague === "Teneke" && weeklyTrophies > 0) {
                // Teneke Escape: Move to Bronze
                targetTier = "Bronze";
            }
            else {
                // Keep current league (convert LeagueName to LeagueTier)
                // Note: LeagueName is "Teneke" | "BRONZE" | "SILVER" | ..., LeagueTier is "Teneke" | "Bronze" | "Silver" | ...
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
        // 4. If Teneke, no bucket assignment needed
        // Zombie Bug Fix: User already removed from old bucket above, now just update user doc
        if (targetTier === "Teneke") {
            // Update user league and clear currentBucketId
            tx.update(userRef, {
                "league.currentLeague": "Teneke",
                "league.currentBucketId": firestore_1.FieldValue.delete(),
            });
            // Return early (no bucket assignment)
            return { bucketId: "", tier: "Teneke" };
        }
        // 4. Find or create bucket
        let bucketId = await (0, assignToLeague_helpers_1.findOpenBucket)(tx, targetTier, seasonId);
        if (!bucketId) {
            // No open bucket found, create new one
            bucketId = await (0, assignToLeague_helpers_1.createNewBucket)(tx, targetTier, seasonId);
            // Update meta to include new bucket
            await (0, assignToLeague_helpers_1.updateLeagueMeta)(tx, targetTier, bucketId, seasonId);
        }
        // 5. Read target bucket
        const bucketRef = firestore_1.db.collection(league_1.LEAGUES_COLLECTION).doc(bucketId);
        const bucketSnap = await tx.get(bucketRef);
        if (!bucketSnap.exists) {
            throw new Error(`Bucket ${bucketId} not found after creation`);
        }
        const bucketData = bucketSnap.data();
        const bucket = league_1.LeagueBucketSchema.parse(bucketData);
        // 6. Check capacity
        if (bucket.players.length >= 30) {
            throw new Error(`Bucket ${bucketId} is full`);
        }
        // 7. Check if user already in bucket
        const existingPlayer = bucket.players.find((p) => p.uid === uid);
        if (existingPlayer) {
            // Already assigned, return
            return { bucketId, tier: targetTier };
        }
        // 8. Create player entry
        const playerEntry = {
            uid,
            weeklyTrophies: userData.league.weeklyTrophies,
            totalTrophies: userData.trophies,
            joinedAt: firestore_1.Timestamp.now(),
        };
        // Validate player entry
        league_1.LeaguePlayerEntrySchema.parse(playerEntry);
        // 10. Add player to bucket
        const newPlayersCount = bucket.players.length + 1;
        const updates = {
            players: firestore_1.FieldValue.arrayUnion(playerEntry),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        // If bucket becomes full, update status
        if (newPlayersCount >= 30) {
            updates.status = "full";
        }
        tx.update(bucketRef, updates);
        // 11. Update league meta (if bucket was just created, already updated above)
        if (bucket.status === "active") {
            await (0, assignToLeague_helpers_1.updateLeagueMeta)(tx, targetTier, bucketId, seasonId);
        }
        // 12. Update user document
        // Refactor: Optimized for O(1) lookup and idempotency
        // Store currentBucketId to avoid O(N) scan in future assignments
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
        return { bucketId, tier: targetTier };
    });
}
