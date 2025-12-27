"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight, Swords } from "lucide-react";

import type { MatchWithId } from "@/features/match/hooks/useActiveMatches";

function shortUid(uid: string) {
  if (!uid) return "—";
  if (uid.length <= 10) return uid;
  return uid.slice(0, 6) + "…" + uid.slice(-4);
}

export function ActiveMatchList({
  uid,
  matches,
  loading,
  error,
}: {
  uid: string | null;
  matches: MatchWithId[];
  loading: boolean;
  error: string | null;
}) {
  const router = useRouter();

  const rows = useMemo(() => {
    if (!uid) return [];
    return matches.map((m) => {
      const players = (m.players ?? []) as string[];
      const oppUid = players.find((p) => p !== uid) ?? null;

      const isWaiting = m.status === "WAITING" || !oppUid;
      const isMyTurn = m.turn?.currentUid === uid && m.status === "ACTIVE";

      const title = isWaiting ? "Bekleniyor..." : shortUid(oppUid!);
      const subtitle =
        m.status === "WAITING"
          ? "Rakip katılınca başlayacak"
          : isMyTurn
            ? "SENİN SIRAN"
            : "Rakipte";

      return { match: m, title, subtitle, isMyTurn, isWaiting };
    });
  }, [matches, uid]);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-neutral-100">Aktif Maçların</div>
        <div className="text-xs text-neutral-400">{matches.length}</div>
      </div>

      {loading && (
        <div className="rounded-2xl bg-neutral-900/60 p-4 text-sm text-neutral-300 ring-1 ring-neutral-800">
          Maçlar yükleniyor...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-2xl bg-neutral-900/40 p-4 text-sm text-neutral-400 ring-1 ring-neutral-800">
          Aktif maçın yok. Yeni maç başlat!
        </div>
      )}

      <div className="mt-3 grid gap-3">
        {rows.map(({ match, title, subtitle, isMyTurn }) => (
          <motion.button
            key={match.id}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push(`/match/${match.id}`)}
            className={[
              "w-full rounded-2xl p-4 text-left ring-1 transition",
              "bg-neutral-900/60 ring-neutral-800 hover:bg-neutral-900/80",
              isMyTurn ? "ring-emerald-500/50" : "",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={[
                    "grid h-11 w-11 place-items-center rounded-2xl ring-1",
                    isMyTurn
                      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                      : "bg-neutral-950/60 text-neutral-300 ring-neutral-800",
                  ].join(" ")}
                >
                  <Swords className="h-5 w-5" />
                </div>

                <div>
                  <div className="text-sm font-semibold text-neutral-100">{title}</div>
                  <div
                    className={[
                      "mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
                      isMyTurn
                        ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                        : "bg-neutral-950/40 text-neutral-300 ring-neutral-800",
                    ].join(" ")}
                  >
                    {subtitle}
                  </div>
                </div>
              </div>

              <ChevronRight className="h-5 w-5 text-neutral-400" />
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  );
}
