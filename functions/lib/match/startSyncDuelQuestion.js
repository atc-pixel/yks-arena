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
        let snap = await tx.get(q);
        if (snap.empty) {
            q = firestore_1.db
                .collection("questions")
                .where("isActive", "==", true)
                .where("category", "==", category)
                .where("randomId", "<", r)
                .orderBy("randomId", "desc")
                .limit(1);
            snap = await tx.get(q);
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
        const syncDuel = match.syncDuel;
        if (!syncDuel)
            throw new https_1.HttpsError("internal", "SyncDuel state missing");
        // Question sonu kontrolü - sadece QUESTION_RESULT veya WAITING_PLAYERS'da yeni soru başlatılabilir
        if (syncDuel.matchStatus === "QUESTION_ACTIVE") {
            // Idempotency: aynı anda 2 client "start" çağırırsa ikinci çağrıyı fail etmek yerine
            // mevcut aktif soruyu geri döndür. UI zaten Firestore snapshot ile senkron olur.
            const current = syncDuel.questions[syncDuel.currentQuestionIndex];
            if (!current) {
                throw new https_1.HttpsError("internal", "Invariant violated: matchStatus QUESTION_ACTIVE but current question missing");
            }
            return { questionId: current.questionId, serverStartAt: current.serverStartAt };
        }
        // Match bitmiş mi kontrolü (3 doğru)
        const correctCounts = syncDuel.correctCounts ?? {};
        const [uid1, uid2] = match.players;
        if ((correctCounts[uid1] ?? 0) >= 3 || (correctCounts[uid2] ?? 0) >= 3) {
            throw new https_1.HttpsError("failed-precondition", "Match already finished");
        }
        // Soru seçimi (kullanılmamış)
        const usedQuestionIds = new Set(syncDuel.questions.map((q) => q.questionId));
        const questionId = await pickRandomQuestionIdTx({
            tx,
            category: syncDuel.category,
            used: usedQuestionIds,
        });
        // Yeni soru oluştur
        const newQuestionIndex = syncDuel.currentQuestionIndex + 1;
        const newQuestion = {
            questionId,
            serverStartAt: nowMs, // Server otorite - timestamp
            answers: {
                [uid1]: {
                    choice: null,
                    isCorrect: null,
                    clientElapsedMs: null,
                    serverReceiveAt: null,
                },
                [uid2]: {
                    choice: null,
                    isCorrect: null,
                    clientElapsedMs: null,
                    serverReceiveAt: null,
                },
            },
            endedReason: null,
            endedAt: null,
        };
        // Update match
        tx.update(matchRef, {
            "syncDuel.questions": [...syncDuel.questions, newQuestion],
            "syncDuel.currentQuestionIndex": newQuestionIndex,
            "syncDuel.matchStatus": "QUESTION_ACTIVE",
        });
        // Return: Client'a gönderilecek payload
        return {
            questionId,
            serverStartAt: nowMs, // Client'a gönder
        };
    });
    return result;
});
