"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserProfile = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("../utils/firestore");
const types_1 = require("./types");
const utils_1 = require("./utils");
exports.ensureUserProfile = (0, https_1.onCall)(async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    const userRef = firestore_1.db.collection(types_1.USER_COLLECTION).doc(uid);
    // idempotent
    const existing = await userRef.get();
    if (existing.exists)
        return { ok: true, created: false };
    const doc = {
        displayName: (0, utils_1.guestNameFromUid)(uid),
        photoURL: null,
        trophies: 0,
        level: 1,
        league: { currentLeague: "Teneke", weeklyTrophies: 0 },
        stats: { totalMatches: 0, totalWins: 0 },
        economy: {
            energy: 5,
            maxEnergy: 5,
            lastEnergyRefill: firestore_1.FieldValue.serverTimestamp(),
        },
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    };
    await userRef.set(doc, { merge: false });
    return { ok: true, created: true };
});
