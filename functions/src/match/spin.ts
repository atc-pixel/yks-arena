import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";

type SymbolKey = "TR1" | "TR2" | "TR3" | "TR4";

const ALL_SYMBOLS: SymbolKey[] = ["TR1", "TR2", "TR3", "TR4"];

function pickRandom<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const matchSpin = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  const matchId = String(req.data?.matchId ?? "").trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId required");

  const matchRef = db.collection("matches").doc(matchId);

  const result = await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found");

    const match = matchSnap.data() as any;

    if (match.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Match not active");
    if (match.turn?.phase !== "SPIN") throw new HttpsError("failed-precondition", "Not in SPIN phase");
    if (match.turn?.currentUid !== uid) throw new HttpsError("failed-precondition", "Not your turn");

    const myState = match.stateByUid?.[uid];
    if (!myState) throw new HttpsError("internal", "Player state missing");

    const owned: SymbolKey[] = (myState.symbols ?? []) as SymbolKey[];
    const available = ALL_SYMBOLS.filter((s) => !owned.includes(s));

    if (available.length === 0) {
      // zaten tamamlamış olmalı; güvenlik fallback
      tx.update(matchRef, { status: "FINISHED", winnerUid: uid, endedReason: "ALL_SYMBOLS_ALREADY_OWNED" });
      return { matchId, symbol: "TR1" as SymbolKey, questionId: "" };
    }

    const symbol = pickRandom(available);

    // Soru seç (şimdilik TURKCE + isActive)
    const used: string[] = match.turn?.usedQuestionIds ?? [];
    const qs = await db
      .collection("questions")
      .where("isActive", "==", true)
      .where("category", "==", "TURKCE")
      .limit(200)
      .get();

    const candidates = qs.docs.map((d) => d.id).filter((id) => !used.includes(id));
    if (candidates.length === 0) throw new HttpsError("resource-exhausted", "No unused questions left");

    const questionId = pickRandom(candidates);

    tx.update(matchRef, {
      "turn.phase": "QUESTION",
      "turn.challengeSymbol": symbol,
      "turn.streak": 0,
      "turn.activeQuestionId": questionId,
      "turn.usedQuestionIds": [...used, questionId],
    });

    return { matchId, symbol, questionId };
  });

  return result;
});
