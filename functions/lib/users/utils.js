"use strict";
// functions/src/users/utils.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.clampMin = clampMin;
exports.hashStringToInt = hashStringToInt;
exports.guestNameFromUid = guestNameFromUid;
exports.calcLevelFromTrophies = calcLevelFromTrophies;
function clampMin(n, min) {
    return n < min ? min : n;
}
// Deterministic hash (no randomness, safe for retries)
function hashStringToInt(input) {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
        h = (h * 31 + input.charCodeAt(i)) | 0; // 32-bit
    }
    return Math.abs(h);
}
function guestNameFromUid(uid) {
    const n = hashStringToInt(uid) % 10000;
    const suffix = String(n).padStart(4, "0");
    return `Misafir #${suffix}`;
}
function calcLevelFromTrophies(totalTrophies) {
    return Math.floor(totalTrophies / 100) + 1;
}
