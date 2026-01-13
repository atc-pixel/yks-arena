"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchOnFinished = exports.ensureUserDocCallable = exports.ensureUserProfile = exports.matchLeaveQueue = exports.matchEnterQueue = exports.matchFinalizeSyncDuelDecision = exports.matchGetServerTime = exports.matchBotAutoPlay = exports.matchTimeoutSyncDuelQuestion = exports.matchSubmitSyncDuelAnswer = exports.matchStartSyncDuelQuestion = exports.cancelInvite = exports.matchJoinInvite = exports.matchCreateInvite = void 0;
// Match Invite Functions
var createInvite_1 = require("./match/createInvite");
Object.defineProperty(exports, "matchCreateInvite", { enumerable: true, get: function () { return createInvite_1.matchCreateInvite; } });
var joinInvite_1 = require("./match/joinInvite");
Object.defineProperty(exports, "matchJoinInvite", { enumerable: true, get: function () { return joinInvite_1.matchJoinInvite; } });
var cancelInvite_1 = require("./match/cancelInvite");
Object.defineProperty(exports, "cancelInvite", { enumerable: true, get: function () { return cancelInvite_1.cancelInvite; } });
// Sync Duel Functions
var startSyncDuelQuestion_1 = require("./match/startSyncDuelQuestion");
Object.defineProperty(exports, "matchStartSyncDuelQuestion", { enumerable: true, get: function () { return startSyncDuelQuestion_1.matchStartSyncDuelQuestion; } });
var submitSyncDuelAnswer_1 = require("./match/submitSyncDuelAnswer");
Object.defineProperty(exports, "matchSubmitSyncDuelAnswer", { enumerable: true, get: function () { return submitSyncDuelAnswer_1.matchSubmitSyncDuelAnswer; } });
var timeoutSyncDuelQuestion_1 = require("./match/timeoutSyncDuelQuestion");
Object.defineProperty(exports, "matchTimeoutSyncDuelQuestion", { enumerable: true, get: function () { return timeoutSyncDuelQuestion_1.matchTimeoutSyncDuelQuestion; } });
var botAutoPlay_1 = require("./match/botAutoPlay");
Object.defineProperty(exports, "matchBotAutoPlay", { enumerable: true, get: function () { return botAutoPlay_1.matchBotAutoPlay; } });
var getServerTime_1 = require("./match/getServerTime");
Object.defineProperty(exports, "matchGetServerTime", { enumerable: true, get: function () { return getServerTime_1.matchGetServerTime; } });
var finalizeSyncDuelDecision_1 = require("./match/finalizeSyncDuelDecision");
Object.defineProperty(exports, "matchFinalizeSyncDuelDecision", { enumerable: true, get: function () { return finalizeSyncDuelDecision_1.matchFinalizeSyncDuelDecision; } });
// Matchmaking
var enterQueue_1 = require("./match/enterQueue");
Object.defineProperty(exports, "matchEnterQueue", { enumerable: true, get: function () { return enterQueue_1.matchEnterQueue; } });
var leaveQueue_1 = require("./match/leaveQueue");
Object.defineProperty(exports, "matchLeaveQueue", { enumerable: true, get: function () { return leaveQueue_1.matchLeaveQueue; } });
// Auth Trigger (Gen 1 - Export edilmeli ki Firebase deploy etsin)
var ensureUserProfile_1 = require("./users/ensureUserProfile");
Object.defineProperty(exports, "ensureUserProfile", { enumerable: true, get: function () { return ensureUserProfile_1.ensureUserProfile; } });
// Geçici: Emulator desteği için callable function
var ensureUserDocCallable_1 = require("./users/ensureUserDocCallable");
Object.defineProperty(exports, "ensureUserDocCallable", { enumerable: true, get: function () { return ensureUserDocCallable_1.ensureUserDocCallable; } });
var onMatchFinished_1 = require("./users/onMatchFinished");
Object.defineProperty(exports, "matchOnFinished", { enumerable: true, get: function () { return onMatchFinished_1.matchOnFinished; } });
