// functions/src/users/types.ts

import { Timestamp } from "firebase-admin/firestore";

export type LeagueName = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";

export interface UserLeague {
  currentLeague: LeagueName;
  weeklyScore: number;
}

export interface UserStats {
  totalMatches: number;
  totalWins: number;
}

export interface UserEconomy {
  energy: number;
  maxEnergy: number;
  lastEnergyRefill: Timestamp;
}

export interface UserPresence {
  activeMatchCount: number;
}

export interface UserDoc {
  displayName: string;
  photoURL: string | null;

  trophies: number;
  level: number;

  league: UserLeague;
  stats: UserStats;
  economy: UserEconomy;
  presence?: UserPresence;

  createdAt: Timestamp;
}

export const USER_COLLECTION = "users";
