"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight, Swords } from "lucide-react";

import type { MatchWithId } from "@/features/match/hooks/useActiveMatches.rq";

function shortUid(uid: string) {
  if (!uid) return "—";
  if (uid.length <= 10) return uid;
  return uid.slice(0, 6) + "…" + uid.slice(-4);
}

export function ActiveMatchList({
  uid,
  matches,
  energy,
  loading,
  error,
}: {
  uid: string | null;
  matches: MatchWithId[];
  energy: number;
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
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="mt-8"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="text-lg font-black uppercase tracking-wide text-white drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          Aktif Maçların
        </div>
        <div className="rounded-full border-2 border-black bg-white px-3 py-1 text-xs font-black text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          {matches.length}
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border-4 border-black bg-white p-5 text-center text-sm font-bold text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          Maçlar yükleniyor...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border-4 border-black bg-red-400 p-5 text-sm font-bold text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-2xl border-4 border-black bg-linear-to-br from-neutral-200 to-neutral-300 p-5 text-center text-sm font-bold text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          Aktif maçın yok. Yeni maç başlat! 🚀
        </div>
      )}

      <div className="mt-4 grid gap-4">
        {rows.map(({ match, title, subtitle, isMyTurn }, index) => {
          // FINISHED match'leri result sayfasına yönlendir
          const handleClick = () => {
            if (match.status === "FINISHED") {
              router.push(`/results/${match.id}`);
            } else {
              router.push(`/match/${match.id}`);
            }
          };

          return (
            <motion.button
            key={match.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98, y: 0 }}
            onClick={handleClick}
            className={[
              "w-full rounded-2xl border-4 border-black p-5 text-left shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all",
              isMyTurn
                ? "bg-linear-to-br from-lime-400 to-green-500 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
                : "bg-linear-to-br from-blue-400 to-cyan-500 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <motion.div
                  animate={isMyTurn ? { rotate: [0, -10, 10, -10, 0] } : {}}
                  transition={
                    isMyTurn
                      ? { repeat: Infinity, duration: 2, ease: "easeInOut" }
                      : {}
                  }
                  className={[
                    "grid h-14 w-14 place-items-center rounded-xl border-4 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
                    isMyTurn
                      ? "bg-yellow-400"
                      : "bg-white",
                  ].join(" ")}
                >
                  <Swords className={["h-6 w-6", isMyTurn ? "text-black" : "text-blue-600"].join(" ")} />
                </motion.div>

                <div>
                  <div className="text-base font-black uppercase tracking-wide text-black drop-shadow-[1px_1px_0px_rgba(255,255,255,0.8)]">
                    {title}
                  </div>
                  <div
                    className={[
                      "mt-2 inline-flex items-center rounded-lg border-2 border-black px-3 py-1 text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
                      isMyTurn
                        ? "bg-yellow-400 text-black"
                        : "bg-white text-blue-600",
                    ].join(" ")}
                  >
                    {subtitle}
                  </div>
                </div>
              </div>

              <ChevronRight className="h-6 w-6 text-black" />
            </div>
          </motion.button>
          );
        })}
      </div>
    </motion.section>
  );
}
