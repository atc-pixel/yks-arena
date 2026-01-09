"use strict";
/**
 * Passive Bot Pool Management
 *
 * Passive botlar ayrı "bot_pool" collection'da bekler.
 * 15 saniye içinde rakip bulunamazsa bot_pool dahil edilir.
 * Naming: bot_passive_xxx
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOT_POOL_COLLECTION_NAME = void 0;
exports.generatePassiveBot = generatePassiveBot;
exports.ensureBotPool = ensureBotPool;
exports.replenishBot = replenishBot;
const nanoid_1 = require("nanoid");
const firestore_1 = require("../utils/firestore");
const constants_1 = require("../shared/constants");
const matchmaking_utils_1 = require("./matchmaking.utils");
// ============================================================================
// CONSTANTS
// ============================================================================
const BOT_POOL_COLLECTION = "bot_pool";
const BOT_BATCH_SIZE = 20; // Her seferde eklenecek bot sayısı
// Tiered distribution: %20 weak, %40 average, %30 strong, %10 pro
const PROFILE_DISTRIBUTION = [
    "WEAK", "WEAK",
    "AVERAGE", "AVERAGE", "AVERAGE", "AVERAGE",
    "STRONG", "STRONG", "STRONG",
    "PRO",
];
const DIFFICULTY_BY_PROFILE = {
    WEAK: [1, 2, 3],
    AVERAGE: [4, 5, 6],
    STRONG: [7, 8],
    PRO: [9, 10],
};
// ============================================================================
// HELPERS
// ============================================================================
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
/**
 * Tek bir passive bot oluştur.
 */
function generatePassiveBot() {
    const profile = pickRandom(PROFILE_DISTRIBUTION);
    const difficulties = DIFFICULTY_BY_PROFILE[profile];
    return {
        uid: `bot_passive_${(0, nanoid_1.nanoid)(12)}`,
        createdAt: firestore_1.Timestamp.now(),
        status: "AVAILABLE",
        skillVector: (0, matchmaking_utils_1.generateBotSkillVector)(profile),
        botDifficulty: pickRandom(difficulties),
    };
}
// ============================================================================
// MAIN FUNCTIONS
// ============================================================================
/**
 * Bot havuzunu kontrol et ve gerekirse doldur.
 * Transaction dışında çağrılmalı (async replenishment).
 */
async function ensureBotPool() {
    const poolRef = firestore_1.db.collection(BOT_POOL_COLLECTION);
    // Count available bots in pool
    const availableBotsSnap = await poolRef
        .where("status", "==", "AVAILABLE")
        .count()
        .get();
    const currentBotCount = availableBotsSnap.data().count;
    // Enough bots? Exit early
    if (currentBotCount >= constants_1.MIN_BOT_POOL_SIZE) {
        return { added: 0, total: currentBotCount };
    }
    // Calculate how many bots to add
    const botsNeeded = Math.min(constants_1.MIN_BOT_POOL_SIZE - currentBotCount, BOT_BATCH_SIZE);
    // Batch write new bots
    const batch = firestore_1.db.batch();
    for (let i = 0; i < botsNeeded; i++) {
        const botData = generatePassiveBot();
        const docRef = poolRef.doc(botData.uid);
        batch.set(docRef, botData);
    }
    await batch.commit();
    console.log(`[BotPool] Added ${botsNeeded} passive bots. Total: ${currentBotCount + botsNeeded}`);
    return { added: botsNeeded, total: currentBotCount + botsNeeded };
}
/**
 * Consume edilen bot'un yerine yenisini ekle (async).
 * enterQueue'dan fire-and-forget olarak çağrılır.
 */
async function replenishBot() {
    try {
        const poolRef = firestore_1.db.collection(BOT_POOL_COLLECTION);
        const botData = generatePassiveBot();
        await poolRef.doc(botData.uid).set(botData);
        console.log(`[BotPool] Replenished: ${botData.uid}`);
    }
    catch (error) {
        console.error("[BotPool] Replenish failed:", error);
    }
}
/**
 * Bot pool collection adını export et (enterQueue'da kullanılacak)
 */
exports.BOT_POOL_COLLECTION_NAME = BOT_POOL_COLLECTION;
