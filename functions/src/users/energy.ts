import { FieldValue } from "../utils/firestore";
import type { UserDoc } from "./types";

/**
 * Hourly refill rule:
 * If now - lastEnergyRefill > 1h => set energy to maxEnergy (default 5) and update lastEnergyRefill.
 * Must be called inside a Firestore transaction.
 */
export function applyHourlyRefillTx(params: {
  tx: FirebaseFirestore.Transaction;
  userRef: FirebaseFirestore.DocumentReference;
  userData: UserDoc | null | undefined;
  nowMs: number;
  hourMs?: number;
}): { refilled: boolean; energyAfter: number } {
  const hourMs = params.hourMs ?? 60 * 60 * 1000;

  const maxEnergy = Number(params.userData?.economy?.maxEnergy ?? 5);
  const currentEnergy = Number(params.userData?.economy?.energy ?? 0);

  const last = params.userData?.economy?.lastEnergyRefill;
  const lastMs = typeof last?.toMillis === "function" ? last.toMillis() : 0;

  if (!lastMs || params.nowMs - lastMs > hourMs) {
    params.tx.update(params.userRef, {
      "economy.energy": maxEnergy,
      "economy.lastEnergyRefill": FieldValue.serverTimestamp(),
    });

    return { refilled: true, energyAfter: maxEnergy };
  }

  return { refilled: false, energyAfter: currentEnergy };
}
