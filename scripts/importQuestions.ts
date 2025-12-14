// scripts/importQuestions.ts
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { parse } from "csv-parse/sync";
import * as admin from "firebase-admin";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

type ChoiceKey = "A" | "B" | "C" | "D" | "E";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return String(v).trim();
}

function normalizeAnswer(raw: unknown): ChoiceKey | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();

  if (!s) return null;

  // Accept: "A", "A)", "A.", "a", "A " etc.
  const first = s[0] as ChoiceKey;
  return (["A", "B", "C", "D", "E"] as const).includes(first) ? first : null;
}

function pad4(n: string) {
  const clean = n.replace(/\D/g, ""); // keep digits
  if (!clean) return "";
  return clean.padStart(4, "0");
}

async function main() {
  const projectId = getEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  // Service account is picked up via GOOGLE_APPLICATION_CREDENTIALS
  // Example:
  // export GOOGLE_APPLICATION_CREDENTIALS="$PWD/serviceAccountKey.json"
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }

  const db = admin.firestore();

  const csvPath = path.join(process.cwd(), "data", "questions_seed.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const csvRaw = fs.readFileSync(csvPath, "utf8");

  const rows: Record<string, any>[] = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  if (!rows.length) throw new Error("CSV is empty.");

  const now = admin.firestore.Timestamp.now();

  const batchLimit = 400; // safe under 500 writes/commit
  let batch = db.batch();
  let ops = 0;

  let imported = 0;
  let skipped = 0;

  for (const r of rows) {
    // Expected columns:
    // "paragraph","questionNumber","question","choiceA","choiceB","choiceC","choiceD","choiceE","Answer"
    const paragraph = String(r.paragraph ?? "").trim();
    const questionNumber = String(r.questionNumber ?? "").trim();
    const question = String(r.question ?? "").trim();

    const choiceA = String(r.choiceA ?? "").trim();
    const choiceB = String(r.choiceB ?? "").trim();
    const choiceC = String(r.choiceC ?? "").trim();
    const choiceD = String(r.choiceD ?? "").trim();
    const choiceE = String(r.choiceE ?? "").trim();

    const answer = normalizeAnswer(r.Answer);

    // Basic validation
    if (
      !question ||
      !choiceA ||
      !choiceB ||
      !choiceC ||
      !choiceD ||
      !choiceE ||
      !answer
    ) {
      skipped++;
      continue;
    }

    // For now: all are Turkish TYT questions
    const category = "TURKCE";

    // Deterministic docId if questionNumber exists, otherwise sequential fallback
    const paddedNo = pad4(questionNumber) || String(imported + 1).padStart(4, "0");
    const docId = `TURKCE-${paddedNo}`;

    const ref = db.collection("questions").doc(docId);

    batch.set(
      ref,
      {
        category,
        // keep your structure compatible with the app
        topic: paragraph || null,
        questionNumber: questionNumber || null,
        question,
        choices: { A: choiceA, B: choiceB, C: choiceC, D: choiceD, E: choiceE },
        answer, // "A".."E"
        explanation: null,
        difficulty: null,
        isActive: true,
        source: "csv_seed",
        updatedAt: now,
        // set createdAt only if doc doesn't exist? (we'll keep merge true and always set createdAt if absent)
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    ops++;
    imported++;

    if (ops >= batchLimit) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
      process.stdout.write(".");
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  console.log(`\n✅ Imported/updated: ${imported}`);
  if (skipped) console.log(`⚠️ Skipped (invalid rows): ${skipped}`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
