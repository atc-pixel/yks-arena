// Match Invite Functions
export { matchCreateInvite } from "./match/createInvite";
export { matchJoinInvite } from "./match/joinInvite";
export { cancelInvite } from "./match/cancelInvite";

// Sync Duel Functions
export { matchStartSyncDuelQuestion } from "./match/startSyncDuelQuestion";
export { matchSubmitSyncDuelAnswer } from "./match/submitSyncDuelAnswer";
export { matchTimeoutSyncDuelQuestion } from "./match/timeoutSyncDuelQuestion";
export { matchBotAutoPlay } from "./match/botAutoPlay";
export { matchGetServerTime } from "./match/getServerTime";
export { matchFinalizeSyncDuelDecision } from "./match/finalizeSyncDuelDecision";

// Matchmaking
export { matchEnterQueue } from "./match/enterQueue";
export { matchLeaveQueue } from "./match/leaveQueue";

// Auth Trigger (Gen 1 - Export edilmeli ki Firebase deploy etsin)
export { ensureUserProfile } from "./users/ensureUserProfile";

// Geçici: Emulator desteği için callable function
export { ensureUserDocCallable } from "./users/ensureUserDocCallable";

export { matchOnFinished } from "./users/onMatchFinished";