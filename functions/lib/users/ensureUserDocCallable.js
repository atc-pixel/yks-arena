"use strict";
/**
 * ensureUserDocCallable (Geçici - Emulator Desteği)
 *
 * Architecture Decision:
 * - Gen 1 auth trigger emulator'da çalışmıyor
 * - Emulator'da test için geçici olarak callable function kullanıyoruz
 * - Frontend'de auth başarılı olduktan sonra çağrılır
 * - Production'da auth trigger zaten çalışıyor (idempotent)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserDocCallable = void 0;
const https_1 = require("firebase-functions/v2/https");
const ensure_1 = require("./ensure");
exports.ensureUserDocCallable = (0, https_1.onCall)({ region: "us-central1" }, async (req) => {
    try {
        const uid = req.auth?.uid;
        if (!uid)
            throw new https_1.HttpsError("unauthenticated", "Auth required.");
        // ensureUserDoc zaten idempotent (zaten varsa ignore eder)
        await (0, ensure_1.ensureUserDoc)(uid);
        return { success: true };
    }
    catch (error) {
        console.error("[ensureUserDocCallable] Error:", error);
        throw error;
    }
});
