import { db } from "../utils/firestore";

const CATEGORIES = ["MAT", "TURKCE", "FEN", "SOSYAL"] as const;

export async function pickQuestionIds(total: number) {
  const snap = await db.collection("questions").where("isActive", "==", true).limit(200).get();
  const all = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((q) => CATEGORIES.includes(q.category));

  // naive shuffle (MVP)
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, total).map((q) => q.id);
}
