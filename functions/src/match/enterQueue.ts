import { onCall, HttpsError } from "firebase-functions/v2/https";
import { nanoid } from "nanoid";
import { db, FieldValue, Timestamp } from "../utils/firestore";
import { ensureUserDoc } from "../users/ensure";
import { applyHourlyRefillTx } from "../users/energy";
import type { UserDoc } from "../users/types";
import type { QueueTicket, MatchDoc, UserCategoryStats, Category, SyncDuelMatchState } from "../shared/types";
import { strictParse, EnterQueueInputSchema } from "../shared/validation";
import { calculateEuclideanDistance, calculateUserVector, getDynamicThreshold, getUserBucket } from "./matchmaking.utils";
import { ensureBotPool, replenishBot, BOT_POOL_COLLECTION_NAME, type BotPoolEntry } from "./botPool";
import { BOT_INCLUSION_THRESHOLD_SECONDS, FUNCTIONS_REGION } from "../shared/constants";

const MATCH_QUEUE_COLLECTION = "match_queue";
const MATCHES_COLLECTION = "matches";
const USERS_COLLECTION = "users";

// #region agent log
function __agentLog(hypothesisId: string, location: string, message: string, data: Record<string, unknown> = {}) {
  try {
    console.log(
      JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now(),
      })
    );
  } catch {
    // ignore
  }
}
function __agentErr(hypothesisId: string, location: string, message: string, data: Record<string, unknown> = {}) {
  try {
    console.error(
      JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now(),
      })
    );
  } catch {
    // ignore
  }
}
// #endregion

type BestMatchFromQueue = QueueTicket & { source: "queue"; id: string };
type BestMatchFromBotPool = BotPoolEntry & { source: "bot_pool"; id: string; isBot: true };
type BestMatch = BestMatchFromQueue | BestMatchFromBotPool;

const BOT_POOL_CANDIDATE_LIMIT = 12;

export const matchEnterQueue = onCall(
  { region: FUNCTIONS_REGION },
  async (req) => {
  const uid = req.auth?.uid;
  __agentLog("H2", "functions/src/match/enterQueue.ts:entry", "matchEnterQueue called", {
    hasAuth: !!uid,
    dataType: typeof req.data,
  });
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  let category: Category;
  try {
    ({ category } = strictParse(EnterQueueInputSchema, req.data, "matchEnterQueue"));
  } catch (e) {
    __agentErr("H2", "functions/src/match/enterQueue.ts:parse_error", "EnterQueueInputSchema parse failed", {
      err: e instanceof Error ? e.message : String(e),
    });
    throw e; // preserve current behavior
  }
  __agentLog("H2", "functions/src/match/enterQueue.ts:parsed", "input parsed", { category });

  try {
    await ensureUserDoc(uid);
  } catch (e) {
    __agentErr("H3", "functions/src/match/enterQueue.ts:ensureUserDoc_error", "ensureUserDoc failed", {
      err: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  // Bot havuzu bakımı (fire-and-forget)
  ensureBotPool().catch((e) => console.error("[BotPool] Maintenance failed:", e));

  const result = await db.runTransaction(async (tx) => {
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError("internal", "User doc missing");

    const userData = userSnap.data() as UserDoc & { categoryStats?: UserCategoryStats };
    const nowMs = Date.now();
    __agentLog("H3", "functions/src/match/enterQueue.ts:tx:user_loaded", "user loaded in TX", {
      uid,
      trophies: Number(userData?.trophies ?? 0),
      activeMatchCount: Number(userData?.presence?.activeMatchCount ?? 0),
    });
    
    // Firestore TX rule: ALL reads must happen before ANY writes.
    // Read ticket + candidates BEFORE applyHourlyRefillTx (writes).
    const ticketRef = db.collection(MATCH_QUEUE_COLLECTION).doc(uid);
    const ticketSnap = await tx.get(ticketRef);

    const queueCandidatesSnap = await tx.get(
      db.collection(MATCH_QUEUE_COLLECTION)
        .where("status", "==", "WAITING")
        .limit(10)
    );

    // Enerji kontrolü
    const { energyAfter: energy } = applyHourlyRefillTx({ tx, userRef, userData, nowMs });
    __agentLog("H3", "functions/src/match/enterQueue.ts:tx:energy_checked", "energy checked", { uid, energy });
    if (energy <= 0) throw new HttpsError("failed-precondition", "ENERGY_ZERO");

    const currentTrophies = userData.trophies ?? 0;
    const currentUserVector = calculateUserVector({
      categoryStats: userData.categoryStats ?? null,
      trophies: currentTrophies,
    });

    // Kuyruk bileti kontrolü
    let waitSeconds = 0;
    const nowTimestamp = Timestamp.now();
    if (ticketSnap.exists) {
      const ticketData = ticketSnap.data() as QueueTicket;
      waitSeconds = nowTimestamp.seconds - ticketData.createdAt.seconds;
    }
    __agentLog("H4", "functions/src/match/enterQueue.ts:tx:candidates_snapshot", "candidates snapshot", {
      uid,
      ticketExisted: ticketSnap.exists,
      waitSeconds,
      candidatesCount: queueCandidatesSnap.size,
    });

    // Aday Arama
    let bestMatch: BestMatch | null = null;
    let minDistance = Infinity;

    // Adayları tara (kategori eşleşmesi kontrolü)
    // Not: forEach callback'i TS control-flow tarafından analiz edilmediği için burada for..of kullanıyoruz.
    for (const doc of queueCandidatesSnap.docs) {
      if (doc.id === uid) continue;
      const candidate = doc.data() as QueueTicket;

      // Kategori eşleşmesi kontrolü (aynı kategori olmalı)
      if (candidate.category !== category) continue;

      // HATA BURADAYDI: skillVector'ın varlığını garantiye alıyoruz
      const distance = calculateEuclideanDistance(currentUserVector, candidate.skillVector);
      const threshold = getDynamicThreshold(waitSeconds);
      // sadece ilk adayda bir kez logla (noise olmasın)
      if (minDistance === Infinity) {
        __agentLog("H4", "functions/src/match/enterQueue.ts:tx:threshold", "threshold computed", {
          uid,
          waitSeconds,
          threshold,
        });
      }

      if (distance <= threshold && distance < minDistance) {
        minDistance = distance;
        bestMatch = { id: doc.id, ...candidate, source: "queue" };
      }
    }

    // Rakip bulunamadıysa BOT_POOL
    if (!bestMatch && waitSeconds >= BOT_INCLUSION_THRESHOLD_SECONDS) {
      __agentLog("H3", "functions/src/match/enterQueue.ts:tx:bot_inclusion", "bot inclusion reached", {
        uid,
        waitSeconds,
        threshold: BOT_INCLUSION_THRESHOLD_SECONDS,
      });
      console.log(
        `[Matchmaking] Bot inclusion window reached (waitSeconds=${waitSeconds}, threshold=${BOT_INCLUSION_THRESHOLD_SECONDS})`
      );
      const botPoolSnap = await tx.get(
        db.collection(BOT_POOL_COLLECTION_NAME)
          .where("status", "==", "AVAILABLE")
          .limit(BOT_POOL_CANDIDATE_LIMIT)
      );

      if (!botPoolSnap.empty) {
        console.log(`[Matchmaking] Bot pool candidates: ${botPoolSnap.size}`);
        // En uygun bot = en küçük skillVector mesafesi
        let bestBotDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
        let bestBotData: BotPoolEntry | null = null;
        let bestBotDistance = Infinity;

        for (const botDoc of botPoolSnap.docs) {
          const botData = botDoc.data() as BotPoolEntry;
          const dist = calculateEuclideanDistance(currentUserVector, botData.skillVector);
          if (dist < bestBotDistance) {
            bestBotDistance = dist;
            bestBotDoc = botDoc;
            bestBotData = botData;
          }
        }

        if (bestBotDoc && bestBotData) {
          console.log(
            `[Matchmaking] Selected bot=${bestBotDoc.id} dist=${Math.round(bestBotDistance)} difficulty=${bestBotData.botDifficulty ?? "na"}`
          );
          bestMatch = { id: bestBotDoc.id, ...bestBotData, isBot: true, source: "bot_pool" };
        }
      } else {
        console.log("[Matchmaking] Bot pool empty (no AVAILABLE bots).");
      }
    }

    if (bestMatch) {
      __agentLog("H3", "functions/src/match/enterQueue.ts:tx:matched", "best match selected", {
        uid,
        source: bestMatch.source,
        opponentId: bestMatch.id,
        isBot: (bestMatch as BestMatchFromBotPool).isBot === true,
      });
      const matchId = nanoid(20);
      const matchRef = db.collection(MATCHES_COLLECTION).doc(matchId);

      // Bot pool'dan gelen botlar için category kullan (eğer category yoksa kullanıcının seçtiği kategoriyi kullan)
      const matchCategory = bestMatch.source === "queue" ? bestMatch.category : category;

      // Sync duel match state initialize
      const syncDuel: SyncDuelMatchState = {
        questions: [],
        correctCounts: {
          [uid]: 0,
          [bestMatch.id]: 0,
        },
        roundWins: {
          [uid]: 0,
          [bestMatch.id]: 0,
        },
        currentQuestionIndex: -1,
        matchStatus: "WAITING_PLAYERS",
        disconnectedAt: {},
        reconnectDeadline: {},
        rageQuitUids: [],
        category: matchCategory,
      };

      const matchDoc: MatchDoc = {
        createdAt: nowTimestamp,
        status: "ACTIVE",
        mode: "SYNC_DUEL",
        players: [uid, bestMatch.id],
        syncDuel,
        stateByUid: {
          [uid]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
          [bestMatch.id]: { trophies: 0, symbols: [], wrongCount: 0, answeredCount: 0 },
        },
        playerTypes: { [uid]: "HUMAN", [bestMatch.id]: bestMatch.isBot ? "BOT" : "HUMAN" },
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
    __agentLog("H3", "functions/src/match/enterQueue.ts:tx:queued", "no match, queued", {
      uid,
      waitSeconds,
      category,
    });
    const newTicket: QueueTicket = {
      uid,
      createdAt: ticketSnap.exists ? (ticketSnap.data() as QueueTicket).createdAt : nowTimestamp,
      status: "WAITING",
      skillVector: currentUserVector,
      category,
      isBot: false,
    };
    tx.set(ticketRef, newTicket);

    return { status: "QUEUED", matchId: null, opponentType: null, waitSeconds };
  });

  __agentLog("H2", "functions/src/match/enterQueue.ts:exit", "matchEnterQueue returned", {
    uid,
    status: (result as { status?: unknown } | undefined)?.status ?? null,
  });
  return result;
});