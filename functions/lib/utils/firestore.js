"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timestamp = exports.FieldValue = exports.db = exports.app = void 0;
// functions/src/utils/firestore.ts
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
Object.defineProperty(exports, "FieldValue", { enumerable: true, get: function () { return firestore_1.FieldValue; } });
const firestore_2 = require("firebase-admin/firestore");
Object.defineProperty(exports, "Timestamp", { enumerable: true, get: function () { return firestore_2.Timestamp; } });
// Admin app init (safe singleton)
exports.app = (0, app_1.getApps)().length ? (0, app_1.getApps)()[0] : (0, app_1.initializeApp)();
// Firestore
exports.db = (0, firestore_1.getFirestore)(exports.app);
