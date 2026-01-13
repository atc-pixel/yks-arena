"use strict";
/**
 * getServerTime Function
 *
 * Client clock skew/latency ölçümü için server'ın Date.now() değerini döner.
 * - Time sync (offset) hesaplamak için kullanılır.
 * - Side-effect yok, idempotent.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchGetServerTime = void 0;
const https_1 = require("firebase-functions/v2/https");
const constants_1 = require("../shared/constants");
const validation_1 = require("../shared/validation");
exports.matchGetServerTime = (0, https_1.onCall)({ region: constants_1.FUNCTIONS_REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Auth required.");
    // Input boş ({}). strictParse null/undefined -> {} normalize eder.
    (0, validation_1.strictParse)(validation_1.GetServerTimeInputSchema, req.data, "matchGetServerTime");
    return { serverTimeMs: Date.now() };
});
