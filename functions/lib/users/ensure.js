"use strict";
// functions/src/users/ensure.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserDoc = ensureUserDoc;
const firestore_1 = require("../utils/firestore");
const types_1 = require("./types");
const utils_1 = require("./utils");
async function ensureUserDoc(uid) {
    const userRef = firestore_1.db.collection(types_1.USER_COLLECTION).doc(uid);
    const doc = {
        displayName: (0, utils_1.guestNameFromUid)(uid),
        photoURL: null,
        trophies: 0,
        level: 1,
        league: { currentLeague: "BRONZE", weeklyScore: 0 },
        stats: { totalMatches: 0, totalWins: 0 },
        economy: {
            energy: 5,
            maxEnergy: 5,
            lastEnergyRefill: firestore_1.FieldValue.serverTimestamp(),
        },
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    };
    // create() exists-check atomik. Eğer zaten varsa error verir -> ignore.
    try {
        await userRef.create(doc);
    }
    catch (e) {
        // ALREADY_EXISTS: ignore
        // Firestore admin error codes farklı gelebiliyor; güvenli ignore:
        return;
    }
}
