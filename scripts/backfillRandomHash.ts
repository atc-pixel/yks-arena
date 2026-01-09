import path from "node:path";
import crypto from "node:crypto";

import dotenv from "dotenv";
import * as admin from "firebase-admin";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

function getEnv(name: string) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return String(v).trim();
}

function stableRandomHashFromId(docId: string, len = 16): string {
  const hex = crypto.createHash("sha256").update(docId).digest("hex");
  const slice = hex.slice(0, 24); // 96 bits
  const asBig = BigInt("0x" + slice);
  const base36 = asBig.toString(36);
  return base36.padStart(len, "0").slice(0, len);
}

async function main() {
  const projectId = getEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }

  const db = admin.firestore();

  const pageSize = 400; // batch size
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  let updated = 0;
  let scanned = 0;

  while (true) {
    let q = db.collection("questions").orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    let batch = db.batch();
    let ops = 0;

    for (const doc of snap.docs) {
      scanned++;

      const data = doc.data();
      if (typeof data.randomHash === "string" && data.randomHash.trim().length > 0) {
        continue;
      }

      const randomHash = stableRandomHashFromId(doc.id, 16);
      batch.update(doc.ref, {
        randomHash,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      ops++;
      updated++;

      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
        process.stdout.write(".");
      }
    }

    if (ops > 0) {
      await batch.commit();
      process.stdout.write(".");
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  console.log(`\n✅ Backfill done. Scanned: ${scanned}, Updated: ${updated}`);
  console.log("If your Functions query prompts an index, create it once via the Firebase/Firestore console link.");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
