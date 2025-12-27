"use client";

import { motion } from "framer-motion";

export function EndPanel({
  winnerUid,
  myUid,
  myTrophies,
  oppTrophies,
  onReturn,
}: {
  winnerUid: string | null | undefined;
  myUid: string | null;
  myTrophies: number;
  oppTrophies: number;
  onReturn: () => void;
}) {
  const title = winnerUid
    ? winnerUid === myUid
      ? "🎉 Kazandın!"
      : "😵 Kaybettin"
    : "Maç Bitti";

  return (
    <section className="rounded-3xl bg-neutral-900/60 p-6 ring-1 ring-neutral-800">
      <div className="text-2xl font-semibold">{title}</div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-neutral-950/50 p-4 ring-1 ring-neutral-800">
          <div className="text-xs text-neutral-400">Sen (Match Kupası)</div>
          <div className="mt-1 text-2xl font-semibold">{myTrophies}</div>
        </div>

        <div className="rounded-2xl bg-neutral-950/50 p-4 ring-1 ring-neutral-800">
          <div className="text-xs text-neutral-400">Rakip (Match Kupası)</div>
          <div className="mt-1 text-2xl font-semibold">{oppTrophies}</div>
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={onReturn}
        className="mt-5 w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-neutral-950 hover:bg-emerald-400"
      >
        Lobby’ye Dön
      </motion.button>
    </section>
  );
}
