import * as admin from "firebase-admin";

export const app = admin.apps.length ? admin.app() : admin.initializeApp();
export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
