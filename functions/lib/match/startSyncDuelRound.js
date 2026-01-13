"use strict";
/**
 * startSyncDuelRound Function
 *
 * Sync duel match'inde yeni bir round başlatır.
 * - Seçilen kategoriden random soru seçer
 * - roundId generate eder
 * - serverStartAt timestamp'i koyar (server authority)
 * - syncDuel.matchStatus: "ROUND_ACTIVE" yapar
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchStartSyncDuelRound = void 0;
const https_1 = require("firebase-functions/v2/https");
const nanoid_1 = require("nanoid");
const firestore_1 = require("../utils/firestore");
const validation_1 = require("../shared/validation");
const RANDOM_ID_MAX = 10_000_000;
function randInt(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
}
/**
 * Random ID Inequality pattern inside a transaction.
 * Avoids usedQuestionIds with retries.
 */
async function pickRandomQuestionIdTx(params) {
    const { tx, category, used, maxAttempts = 14 } = params;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const r = randInt(RANDOM_ID_MAX);
        let q = firestore_1.db
            .collection("questions")
            .where("isActive", "==", true)
            .where("category", "==", category)
            .where("randomId", ">=", r)
            .orderBy("randomId", "asc")
            .limit(1);
        let snap;
        try {
            snap = await tx.get(q);
        }
        catch (queryError) {
            throw queryError;
        }
        if (snap.empty) {
            q = firestore_1.db
                .collection("questions")
                .where("isActive", "==", true)
                .where("category", "==", category)
                .where("randomId", "<", r)
                .orderBy("randomId", "desc")
                .limit(1);
            try {
                snap = await tx.get(q);
            }
            catch (queryError) {
                throw queryError;
            }
        }
        if (snap.empty) {
            continue;
        }
        const id = snap.docs[0].id;
        if (!used.has(id))
            return id;
    }
    throw new https_1.HttpsError("resource-exhausted", `No unused questions available for category "${category}" (randomId retries exhausted).`);
}
exports.matchStartSyncDuelRound = (0, https_1.onCall)({ region: "us-central1" }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const { matchId } = (0, validation_1.strictParse)(validation_1.StartSyncDuelRoundInputSchema, req.data, "matchStartSyncDuelRound");
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
        const syncDuel = match.syncDuel;
        if (!syncDuel)
            throw new https_1.HttpsError("internal", "SyncDuel state missing");
        // Round sonu kontrolü - sadece ROUND_RESULT veya WAITING_PLAYERS'da yeni round başlatılabilir
        if (syncDuel.matchStatus === "ROUND_ACTIVE") {
            throw new https_1.HttpsError("failed-precondition", "Round already active");
        }
        // Max 5 round
        if (syncDuel.currentRoundNumber >= 5) {
            throw new https_1.HttpsError("failed-precondition", "Max rounds reached");
        }
        // Match bitmiş mi kontrolü (3 round win)
        const wins = syncDuel.roundWins;
        const [uid1, uid2] = match.players;
        if ((wins[uid1] ?? 0) >= 3 || (wins[uid2] ?? 0) >= 3) {
            throw new https_1.HttpsError("failed-precondition", "Match already finished");
        }
        // Soru seçimi (kullanılmamış)
        const usedQuestionIds = new Set(syncDuel.rounds.map((r) => r.questionId));
        const questionId = await pickRandomQuestionIdTx({
            tx,
            category: syncDuel.category,
            used: usedQuestionIds,
        });
        // Yeni round oluştur
        const roundId = (0, nanoid_1.nanoid)(20);
        const newRoundNumber = syncDuel.currentRoundNumber + 1;
        const newRound = {
            roundId,
            roundNumber: newRoundNumber,
            questionId,
            serverStartAt: nowMs, // Server otorite - timestamp
            answers: {
                [uid1]: {
                    choice: null,
                    isCorrect: null,
                    clientElapsedMs: null,
                    serverReceiveAt: null,
                    effectiveMs: null,
                },
                [uid2]: {
                    choice: null,
                    isCorrect: null,
                    clientElapsedMs: null,
                    serverReceiveAt: null,
                    effectiveMs: null,
                },
            },
            roundWinnerUid: null,
            endedAt: null,
        };
        // Update match
        tx.update(matchRef, {
            "syncDuel.rounds": [...syncDuel.rounds, newRound],
            "syncDuel.currentRoundNumber": newRoundNumber,
            "syncDuel.matchStatus": "ROUND_ACTIVE",
        });
        // Return: Client'a gönderilecek payload
        return {
            roundId,
            questionId,
            serverStartAt: nowMs, // Client'a gönder
        };
    });
    return result;
});
