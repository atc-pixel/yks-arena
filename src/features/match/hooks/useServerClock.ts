/**
 * useServerClock Hook
 *
 * Client clock skew'ünü minimize etmek için server time offset hesaplar.
 * - nowMs = Date.now() + offsetMs
 * - latencyMs ölçümü sadece debug/telemetry içindir.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getServerTime } from "@/features/match/services/match.api";

type ServerClockState = {
  ready: boolean;
  offsetMs: number; // serverTime - clientNow (approx)
  latencyMs: number | null;
};

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function useServerClock() {
  const [state, setState] = useState<ServerClockState>({ ready: false, offsetMs: 0, latencyMs: null });

  useEffect(() => {
    let cancelled = false;

    async function measure() {
      try {
        // 3 sample alıp median ile jitter etkisini azaltalım (hafif ama etkili).
        const offsets: number[] = [];
        const latencies: number[] = [];

        for (let i = 0; i < 3; i++) {
          const sendTime = Date.now();
          const { serverTimeMs } = await getServerTime();
          const receiveTime = Date.now();

          const rtt = Math.max(0, receiveTime - sendTime);
          const latency = rtt / 2;
          const offset = serverTimeMs - sendTime - latency;

          offsets.push(offset);
          latencies.push(latency);

          // küçük boşluk (aynı event loop’ta 3 ardışık ölçüm çok gürültülü olabiliyor)
          if (i < 2) await new Promise((r) => setTimeout(r, 80));
        }

        if (cancelled) return;

        const offsetMs = Math.round(median(offsets));
        const latencyMs = Math.round(median(latencies));

        setState({ ready: true, offsetMs, latencyMs });
      } catch {
        // Fallback: offset 0 ile devam (timer yine çalışır; sadece skew koruması olmaz).
        if (cancelled) return;
        setState({ ready: true, offsetMs: 0, latencyMs: null });
      }
    }

    measure();
    return () => {
      cancelled = true;
    };
  }, []);

  const nowMs = useCallback(() => Date.now() + state.offsetMs, [state.offsetMs]);

  return useMemo(
    () => ({
      ...state,
      nowMs,
    }),
    [state, nowMs]
  );
}

