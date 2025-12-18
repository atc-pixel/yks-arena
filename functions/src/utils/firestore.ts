// functions/src/utils/firestore.ts
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

// Admin app init (safe singleton)
export const app = getApps().length ? getApps()[0] : initializeApp();

// Firestore
export const db = getFirestore(app);

// Helpers
export { FieldValue, Timestamp };
