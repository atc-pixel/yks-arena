import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";

type ChoiceKey = "A" | "B" | "C" | "D" | "E";
type SymbolKey = "TR1" | "TR2" | "TR3" | "TR4";

const ALL_SYMBOLS: SymbolKey[] = ["TR1", "TR2", "TR3", "TR4"];

function otherPlayer(players: string[], uid: string) {
  return players.find((p) => p !== uid) ?? "";
}

export const matchSubmitAnswer = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  const matchId = String(req.data?.matchId ?? "").trim();
  const answer = String(req.data?.answer ?? "").trim().toUpperCase() as ChoiceKey;

  if (!matchId) throw new HttpsError("invalid-argument", "matchId required");
  if (!["A", "B", "C", "D", "E"].includes(answer)) throw new HttpsError("invalid-argument", "bad answer");

  const matchRef = db.collection("matches").doc(matchId);

  const res = await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found");

    const match = matchSnap.data() as any;

    if (match.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Match not active");
    if (match.turn?.phase !== "QUESTION") throw new HttpsError("failed-precondition", "Not in QUESTION phase");
    if (match.turn?.currentUid !== uid) throw new HttpsError("failed-precondition", "Not your turn");

    const players: string[] = match.players ?? [];
    const oppUid = otherPlayer(players, uid);
    if (!oppUid) throw new HttpsError("internal", "Opponent missing");

    const qid: string | null = match.turn?.activeQuestionId ?? null;
    const symbol: SymbolKey | null = match.turn?.challengeSymbol ?? null;
    const streak: 0 | 1 = match.turn?.streak ?? 0;

    if (!qid || !symbol) throw new HttpsError("internal", "Turn missing question/symbol");

    const qRef = db.collection("questions").doc(qid);
    const qSnap = await tx.get(qRef);
    if (!qSnap.exists) throw new HttpsError("internal", "Question missing");

    const q = qSnap.data() as any;
    const isCorrect = q.answer === answer;

    const stateByUid = { ...(match.stateByUid ?? {}) };
    const my = { ...(stateByUid[uid] ?? { lives: 5, points: 0, symbols: [], wrongCount: 0, answeredCount: 0 }) };
    const opp = { ...(stateByUid[oppUid] ?? { lives: 5, points: 0, symbols: [], wrongCount: 0, answeredCount: 0 }) };

    my.answeredCount = (my.answeredCount ?? 0) + 1;

    if (!isCorrect) {
      my.wrongCount = (my.wrongCount ?? 0) + 1;

      // yanlış: sıra rakibe geçer, sembol boşa düşer
      stateByUid[uid] = my;
      stateByUid[oppUid] = opp;

      tx.update(matchRef, {
        stateByUid,
        "turn.phase": "SPIN",
        "turn.challengeSymbol": null,
        "turn.streak": 0,
        "turn.activeQuestionId": null,
        "turn.currentUid": oppUid,
      });

      return { matchId, status: "ACTIVE", phase: "SPIN" as const };
    }

    // doğru
    const nextStreak = (streak === 0 ? 1 : 2) as 1 | 2;

    if (nextStreak === 1) {
      // aynı sembolde ikinci soruyu aç
      const used: string[] = match.turn?.usedQuestionIds ?? [];

      const qs = await db
        .collection("questions")
        .where("isActive", "==", true)
        .where("category", "==", "TURKCE")
        .limit(200)
        .get();

      const candidates = qs.docs.map((d) => d.id).filter((id) => !used.includes(id));
      if (candidates.length === 0) throw new HttpsError("resource-exhausted", "No unused questions left");

      const nextQid = candidates[Math.floor(Math.random() * candidates.length)];

      stateByUid[uid] = my;
      stateByUid[oppUid] = opp;

      tx.update(matchRef, {
        stateByUid,
        "turn.phase": "QUESTION",
        "turn.streak": 1,
        "turn.activeQuestionId": nextQid,
        "turn.usedQuestionIds": [...used, nextQid],
      });

      return { matchId, status: "ACTIVE", phase: "QUESTION" as const };
    }

    // nextStreak === 2: sembol kazanılır
    const owned: SymbolKey[] = (my.symbols ?? []) as SymbolKey[];
    const newOwned = owned.includes(symbol) ? owned : [...owned, symbol];
    my.symbols = newOwned;

    // Kazandı mı?
    const hasAll = ALL_SYMBOLS.every((s) => newOwned.includes(s));

    // perfect run: 8/8 (2 soru * 4 sembol) ve yanlış 0
    const isPerfect = hasAll && (my.answeredCount === 8) && (my.wrongCount === 0);

    if (hasAll) {
      // Puan/can kuralı
      // MVP puan: winner +10, loser -10 (perfect'te loser değişmez)
      my.points = (my.points ?? 0) + 10;

      if (!isPerfect) {
        opp.lives = Math.max(0, (opp.lives ?? 5) - 1);
        opp.points = (opp.points ?? 0) - 10;
      }

      stateByUid[uid] = my;
      stateByUid[oppUid] = opp;

      tx.update(matchRef, {
        status: "FINISHED",
        winnerUid: uid,
        endedReason: isPerfect ? "PERFECT_8_OF_8" : "ALL_SYMBOLS_COLLECTED",
        stateByUid,
        "turn.phase": "SPIN",
        "turn.challengeSymbol": null,
        "turn.streak": 0,
        "turn.activeQuestionId": null,
      });

      return { matchId, status: "FINISHED", phase: "SPIN" as const };
    }

    // sembol alındı ama oyun bitmedi: aynı oyuncu devam, phase SPIN
    stateByUid[uid] = my;
    stateByUid[oppUid] = opp;

    tx.update(matchRef, {
      stateByUid,
      "turn.phase": "SPIN",
      "turn.challengeSymbol": null,
      "turn.streak": 0,
      "turn.activeQuestionId": null,
      // currentUid aynı kalır
    });

    return { matchId, status: "ACTIVE", phase: "SPIN" as const };
  });

  return res;
});
