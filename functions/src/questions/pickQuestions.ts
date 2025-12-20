import { db } from "../utils/firestore";

/**
 * Scalable random question picking using the "Random ID" inequality pattern.
 *
 * Why:
 * - Works well even when the questions collection grows large.
 * - Avoids reading big batches (e.g. limit(200) + shuffle).
 *
 * Requirements:
 * - Each question doc must have:
 *   - category: string
 *   - isActive: boolean
 *   - randomId: number (0..9,999,999)
 */

export const RANDOM_ID_MAX = 10_000_000;

function randInt(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}

async function pickOneId(category: string): Promise<string | null> {
  const randomVal = randInt(RANDOM_ID_MAX);

  // Primary: randomId >= randomVal (wraps naturally if empty)
  let snap = await db
    .collection("questions")
    .where("isActive", "==", true)
    .where("category", "==", category)
    .where("randomId", ">=", randomVal)
    .orderBy("randomId", "asc")
    .limit(1)
    .get();

  if (!snap.empty) return snap.docs[0].id;

  // Fallback / wrap-around: randomId < randomVal
  snap = await db
    .collection("questions")
    .where("isActive", "==", true)
    .where("category", "==", category)
    .where("randomId", "<", randomVal)
    .orderBy("randomId", "desc")
    .limit(1)
    .get();

  if (!snap.empty) return snap.docs[0].id;

  // Pool empty
  return null;
}

/**
 * Pick up to `count` unique question IDs for a given category.
 *
 * If the DB has fewer than `count` questions in that category, it returns as many as exist.
 * (No throw, no infinite loop.)
 */
export async function pickQuestionIdsByCategory(category: string, count: number): Promise<string[]> {
  const safeCount = Math.max(0, Math.floor(count));
  if (!category || safeCount <= 0) return [];

  const picked = new Set<string>();

  // Prevent infinite loops when the pool is tiny.
  // With a good randomId distribution, duplicates are rare; this is a safety cap.
  const maxAttempts = Math.max(30, safeCount * 25);

  for (let i = 0; i < maxAttempts && picked.size < safeCount; i++) {
    const id = await pickOneId(category);
    if (!id) break;
    picked.add(id);
  }

  return Array.from(picked);
}

/**
 * Back-compat wrapper (old signature in repo).
 *
 * NOTE: Old code didn't have category input and used a naive shuffle.
 * We keep this to avoid breaking future/experimental callers.
 */
export async function pickQuestionIds(total: number): Promise<string[]> {
  // Default category is intentionally not enforced here.
  // If you still call this, you should switch to pickQuestionIdsByCategory.
  // Returning empty makes failures obvious in dev.
  return [];
}
