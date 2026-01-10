"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserProfile = void 0;
/**
 * Gen 1 Auth Trigger (Otomatik, Maliyetsiz, Güvenilir)
 *
 * Architecture Decision:
 * - Gen 1 auth.user().onCreate trigger kullanıyoruz (Spark planında bile çalışır)
 * - Otomatik çalışır, blocking function gibi enable etmeye gerek yok
 * - Kullanıcı Auth'a yazıldıktan SONRA çalışır (asenkron)
 * - Idempotent: Zaten varsa tekrar oluşturmaz
 */
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const types_1 = require("./types");
const utils_1 = require("./utils");
// Admin SDK başlatma
if (!admin.apps.length) {
    admin.initializeApp();
}
/**
 * Kullanıcı Authentication servisine yazıldığında otomatik çalışır.
 * Firestore'da users/{uid} dokümanını oluşturur.
 *
 * Architecture Decision:
 * - Region: europe-west1 (diğer functions ile aynı)
 * - Gen 1 functions için CPU/memory ayarı yapılamaz (Spark planında çalışır)
 */
exports.ensureUserProfile = functions
    .region("europe-west1")
    .auth.user()
    .onCreate(async (user) => {
    try {
        const db = admin.firestore();
        const uid = user.uid;
        const userRef = db.collection(types_1.USER_COLLECTION).doc(uid);
        // Idempotency Check (Mükerrer kaydı önle)
        const existing = await userRef.get();
        if (existing.exists) {
            console.log(`[ensureUserProfile] User already exists: ${uid}`);
            return;
        }
        // Profil Oluştur
        const initialProfile = {
            displayName: (0, utils_1.guestNameFromUid)(uid),
            photoURL: user.photoURL || null,
            trophies: 0,
            level: 1,
            league: { currentLeague: "Teneke", weeklyTrophies: 0 },
            stats: { totalMatches: 0, totalWins: 0 },
            economy: {
                energy: 30, // Bonkör başlangıç
                maxEnergy: 5,
                lastEnergyRefill: admin.firestore.FieldValue.serverTimestamp(),
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await userRef.set(initialProfile);
        console.log(`[ensureUserProfile] Profile created for: ${uid}`);
    }
    catch (error) {
        console.error(`[ensureUserProfile] Error creating profile for ${user.uid}:`, error);
        // Trigger hatalarını yutmamak lazım ama sonsuz döngüye girmesin diye re-throw yapmıyoruz
    }
});
