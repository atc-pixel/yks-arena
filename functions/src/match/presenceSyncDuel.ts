/**
 * Sync Duel presence helpers.
 *
 * Goal: Detect disconnect/reconnect and set a server-authoritative reconnect deadline.
 * Rage quit finalization is handled separately (scheduled/trigger).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import type { MatchDoc } from "../shared/types";
import {
  strictParse,
  MarkSyncDuelDisconnectedInputSchema,
  MarkSyncDuelReconnectedInputSchema,
} from "../shared/validation";
import { FUNCTIONS_REGION } from "../shared/constants";

const RECONNECT_WINDOW_MS = 30_000;

function assertPlayer(params: { match: MatchDoc; uid: string }) {
  const { match, uid } = params;
  if (!Array.isArray(match.players) || match.players.length !== 2) {
    throw new HttpsError("internal", "Invalid players");
  }
  if (!match.players.includes(uid)) {
    throw new HttpsError("permission-denied", "Not a player in this match");
  }
}

function recomputeMinDeadline(reconnectDeadline: Record<string, number | null> | undefined): number | null {
  const values = Object.values(reconnectDeadline ?? {}).filter((v): v is number => typeof v === "number");
  if (!values.length) return null;
  return Math.min(...values);
}

export const matchMarkSyncDuelDisconnected = onCall({ region: FUNCTIONS_REGION }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  const { matchId } = strictParse(MarkSyncDuelDisconnectedInputSchema, req.data, "matchMarkSyncDuelDisconnected");
  const matchRef = db.collection("matches").doc(matchId);
  const nowMs = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new HttpsError("not-found", "Match not found");

    const match = snap.data() as MatchDoc | undefined;
    if (!match) throw new HttpsError("internal", "Match data invalid");
    if (match.mode !== "SYNC_DUEL") throw new HttpsError("failed-precondition", "Not a sync duel match");
    if (match.status !== "ACTIVE") return;
    if (!match.syncDuel) throw new HttpsError("internal", "SyncDuel state missing");

    assertPlayer({ match, uid });

    const disconnectedAt = { ...(match.syncDuel.disconnectedAt ?? {}) };
    const reconnectDeadline = { ...(match.syncDuel.reconnectDeadline ?? {}) };

    disconnectedAt[uid] = nowMs;
    reconnectDeadline[uid] = nowMs + RECONNECT_WINDOW_MS;

    const reconnectDeadlineMin = recomputeMinDeadline(reconnectDeadline);

    tx.update(matchRef, {
      "syncDuel.disconnectedAt": disconnectedAt,
      "syncDuel.reconnectDeadline": reconnectDeadline,
      "syncDuel.reconnectDeadlineMin": reconnectDeadlineMin,
    });
  });

  return { success: true };
});

export const matchMarkSyncDuelReconnected = onCall({ region: FUNCTIONS_REGION }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required.");

  const { matchId } = strictParse(MarkSyncDuelReconnectedInputSchema, req.data, "matchMarkSyncDuelReconnected");
  const matchRef = db.collection("matches").doc(matchId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new HttpsError("not-found", "Match not found");

    const match = snap.data() as MatchDoc | undefined;
    if (!match) throw new HttpsError("internal", "Match data invalid");
    if (match.mode !== "SYNC_DUEL") throw new HttpsError("failed-precondition", "Not a sync duel match");
    if (match.status !== "ACTIVE") return;
    if (!match.syncDuel) throw new HttpsError("internal", "SyncDuel state missing");

    assertPlayer({ match, uid });

    const disconnectedAt = { ...(match.syncDuel.disconnectedAt ?? {}) };
    const reconnectDeadline = { ...(match.syncDuel.reconnectDeadline ?? {}) };

    disconnectedAt[uid] = null;
    reconnectDeadline[uid] = null;

    const reconnectDeadlineMin = recomputeMinDeadline(reconnectDeadline);

    tx.update(matchRef, {
      "syncDuel.disconnectedAt": disconnectedAt,
      "syncDuel.reconnectDeadline": reconnectDeadline,
      "syncDuel.reconnectDeadlineMin": reconnectDeadlineMin,
    });
  });

  return { success: true };
});

