// functions/src/users/utils.ts

export function clampMin(n: number, min: number) {
  return n < min ? min : n;
}

// Deterministic hash (no randomness, safe for retries)
export function hashStringToInt(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0; // 32-bit
  }
  return Math.abs(h);
}

export function guestNameFromUid(uid: string) {
  const n = hashStringToInt(uid) % 10000;
  const suffix = String(n).padStart(4, "0");
  return `Misafir #${suffix}`;
}

export function calcLevelFromTrophies(totalTrophies: number) {
  return Math.floor(totalTrophies / 100) + 1;
}
