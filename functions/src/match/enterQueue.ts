import { onCall, HttpsError } from "firebase-functions/v2/https";
import { nanoid } from "nanoid";
import { db, FieldValue, Timestamp } from "../utils/firestore";
import { ensureUserDoc } from "../users/ensure";
import { applyHourlyRefillTx } from "../users/energy";
import type { UserDoc } from "../users/types";
import type { QueueTicket, MatchDoc, UserCategoryStats } from "../shared/types";
import { strictParse, EnterQueueInputSchema } from "../shared/validation";
import { calculateEuclideanDistance, calculateUserVector, getDynamicThreshold, getUserBucket } from "./matchmaking.utils";
import { ensureBotPool, replenishBot, BOT_POOL_COLLECTION_NAME, type BotPoolEntry } from "./botPool";
import { BOT_INCLUSION_THRESHOLD_SECONDS } from "../shared/constants";

const MATCH_QUEUE_COLLECTION = "match_queue";
const MATCHES_COLLECTION = "matches";
const USERS_COLLECTION = "users";

export const matchEnterQueue = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  strictParse(EnterQueueInputSchema, req.data, "matchEnterQueue");
  await ensureUserDoc(uid);

  // Bot havuzu bakımı (fire-and-forget)
  ensureBotPool().catch((e) => console.error("[BotPool] Maintenance failed:", e));

  const result = await db.runTransaction(async (tx) => {
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError("internal", "User doc missing");

    const userData = userSnap.data() as UserDoc & { categoryStats?: UserCategoryStats };
    const nowMs = Date.now();
    
    // Enerji kontrolü
    const { energyAfter: energy } = applyHourlyRefillTx({ tx, userRef, userData, nowMs });
    if (energy <= 0) throw new HttpsError("failed-precondition", "ENERGY_ZERO");

    const currentTrophies = userData.trophies ?? 0;
    const currentUserVector = calculateUserVector({
      categoryStats: userData.categoryStats ?? null,
      trophies: currentTrophies,
    });

    // Kuyruk bileti kontrolü
    const ticketRef = db.collection(MATCH_QUEUE_COLLECTION).doc(uid);
    const ticketSnap = await tx.get(ticketRef);
    
    let waitSeconds = 0;
    const nowTimestamp = Timestamp.now();
    if (ticketSnap.exists) {
      const ticketData = ticketSnap.data() as QueueTicket;
      waitSeconds = nowTimestamp.seconds - ticketData.createdAt.seconds;
    }

    // Aday Arama
    const queueCandidatesSnap = await tx.get(
      db.collection(MATCH_QUEUE_COLLECTION)
        .where("status", "==", "WAITING")
        .limit(10)
    );

    let bestMatch: any = null;
    let minDistance = Infinity;

    // Adayları tara
    queueCandidatesSnap.docs.forEach(doc => {
      if (doc.id === uid) return;
      const candidate = doc.data() as QueueTicket;
      
      // HATA BURADAYDI: skillVector'ın varlığını garantiye alıyoruz
      const distance = calculateEuclideanDistance(currentUserVector, candidate.skillVector);
      const threshold = getDynamicThreshold(waitSeconds);

      if (distance <= threshold && distance < minDistance) {
        minDistance = distance;
        bestMatch = { id: doc.id, ...candidate, source: "queue" };
      }
    });

    // Rakip bulunamadıysa BOT_POOL
    if (!bestMatch && waitSeconds >= BOT_INCLUSION_THRESHOLD_SECONDS) {
      const botPoolSnap = await tx.get(
        db.collection(BOT_POOL_COLLECTION_NAME)
          .where("status", "==", "AVAILABLE")
          .limit(1)
      );

      if (!botPoolSnap.empty) {
        const botDoc = botPoolSnap.docs[0];
        const botData = botDoc.data() as BotPoolEntry;
        bestMatch = { id: botDoc.id, ...botData, isBot: true, source: "bot_pool" };
      }
    }

    if (bestMatch) {
      const matchId = nanoid(20);
      const matchRef = db.collection(MATCHES_COLLECTION).doc(matchId);

      const matchDoc: MatchDoc = {
        createdAt: nowTimestamp,
        status: "ACTIVE",
        mode: "RANDOM",
        players: [uid, bestMatch.id],
        playerTypes: { [uid]: "HUMAN", [bestMatch.id]: bestMatch.isBot ? "BOT" : "HUMAN" },
        turn: { currentUid: uid, phase: "SPIN", challengeSymbol: null, streak: 0, activeQuestionId: null, usedQuestionIds: [], streakSymbol: null, questionIndex: 0 },
        stateByUid: {
          [uid]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
          [bestMatch.id]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
        },
      };

      tx.set(matchRef, matchDoc);
      tx.update(userRef, { "presence.activeMatchCount": FieldValue.increment(1) });

      if (bestMatch.source === "queue") {
        tx.update(db.collection(MATCH_QUEUE_COLLECTION).doc(bestMatch.id), { status: "MATCHED" });
        if (!bestMatch.isBot) {
          tx.update(db.collection(USERS_COLLECTION).doc(bestMatch.id), { "presence.activeMatchCount": FieldValue.increment(1) });
        }
      } else {
        tx.update(db.collection(BOT_POOL_COLLECTION_NAME).doc(bestMatch.id), { status: "IN_USE" });
        replenishBot().catch(() => {});
      }

      tx.delete(ticketRef);
      return { status: "MATCHED", matchId, opponentType: bestMatch.isBot ? "BOT" : "HUMAN" };
    }

    // KUYRUĞA EKLE
    const newTicket: QueueTicket = {
      uid,
      createdAt: ticketSnap.exists ? (ticketSnap.data() as QueueTicket).createdAt : nowTimestamp,
      status: "WAITING",
      skillVector: currentUserVector,
      isBot: false,
    };
    tx.set(ticketRef, newTicket);

    return { status: "QUEUED", matchId: null, opponentType: null, waitSeconds };
  });

  return result;
});