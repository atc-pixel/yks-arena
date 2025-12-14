import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import dotenv from "dotenv";
import { parse } from "csv-parse/sync";
import * as admin from "firebase-admin";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

type ChoiceKey = "A" | "B" | "C" | "D" | "E";
type Category = "MAT" | "TURKCE" | "FEN" | "SOSYAL";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return String(v).trim();
}

function normalizeAnswer(raw: unknown): ChoiceKey | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  const first = s[0] as ChoiceKey;
  return ["A", "B", "C", "D", "E"].includes(first) ? first : null;
}

function normalizeCategory(raw: unknown): Category {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "MAT" || s === "TURKCE" || s === "FEN" || s === "SOSYAL") return s;
  return "TURKCE"; // default (senin şu anki setup)
}

function toBool(raw: unknown, fallback: boolean) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const s = String(raw).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return fallback;
}

function toNum(raw: unknown): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Deterministic randomHash (stable across imports).
 * - Based on docId so it never changes for the same question doc.
 * - Output is fixed-length base36 string (16 chars) good for lexicographic range queries.
 */
function stableRandomHashFromId(docId: string, len = 16): string {
  const hex = crypto.createHash("sha256").update(docId).digest("hex"); // 64 hex chars
  // Take 24 hex chars = 96 bits -> BigInt -> base36
  const slice = hex.slice(0, 24);
  const asBig = BigInt("0x" + slice);
  const base36 = asBig.toString(36);
  return base36.padStart(len, "0").slice(0, len);
}

function pad4FromDigits(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(4, "0");
}

/**
 * DocId strategy (future-proof):
 * 1) If questionNumber exists -> `${category}-${0001}`
 * 2) Else -> `${category}-H${hash(question)}` (stable across imports)
 */
function makeDocId(params: { category: Category; questionNumber: string; question: string }) {
  const { category, questionNumber, question } = params;

  const padded = pad4FromDigits(questionNumber);
  if (padded) return `${category}-${padded}`;

  const qHash = crypto.createHash("sha1").update(question).digest("hex").slice(0, 10);
  return `${category}-H${qHash}`.toUpperCase();
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

  // Batch safety
  const batchLimit = 400;
  let batch = db.batch();
  let ops = 0;

  let imported = 0;
  let skipped = 0;

  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const r of rows) {
    // Your current columns:
    // paragraph,questionNumber,question,choiceA,choiceB,choiceC,choiceD,choiceE,Answer
    // Future-friendly optional columns:
    // category,topic,difficulty,explanation,isActive
    const category = normalizeCategory(r.category);

    const paragraph = String(r.paragraph ?? "").trim(); // we map to topic by default
    const topic = String(r.topic ?? "").trim() || paragraph || null;

    const questionNumber = String(r.questionNumber ?? "").trim();
    const question = String(r.question ?? "").trim();

    const choiceA = String(r.choiceA ?? "").trim();
    const choiceB = String(r.choiceB ?? "").trim();
    const choiceC = String(r.choiceC ?? "").trim();
    const choiceD = String(r.choiceD ?? "").trim();
    const choiceE = String(r.choiceE ?? "").trim();

    const answer = normalizeAnswer(r.Answer);

    const difficulty = toNum(r.difficulty);
    const explanation = String(r.explanation ?? "").trim() || null;

    // Default active true unless explicitly set
    const isActive = toBool(r.isActive, true);

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

    const docId = makeDocId({ category, questionNumber, question });
    const randomHash = stableRandomHashFromId(docId, 16);

    const ref = db.collection("questions").doc(docId);

    batch.set(
      ref,
      {
        category,
        topic,
        questionNumber: questionNumber || null,
        question,
        choices: { A: choiceA, B: choiceB, C: choiceC, D: choiceD, E: choiceE },
        answer,
        explanation,
        difficulty,
        isActive,

        // Critical for random selection
        randomHash,

        source: "csv_seed",
        updatedAt: now,
        createdAt: now,
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

  console.log("\nNext steps:");
  console.log("- Ensure Firestore composite index exists for queries on (category, isActive, randomHash).");
  console.log("- Add more rows to data/questions_seed.csv and re-run this import anytime.");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
