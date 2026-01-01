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
    <motion.section
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300 }}
      className="rounded-3xl border-4 border-black bg-linear-to-br from-yellow-400 via-orange-400 to-pink-500 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
    >
      <motion.div
        animate={winnerUid === myUid ? { scale: [1, 1.1, 1] } : {}}
        transition={{ repeat: Infinity, duration: 1.5 }}
        className="text-3xl font-black uppercase tracking-wide text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.8)]"
      >
        {title}
      </motion.div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="text-xs font-black uppercase tracking-wide text-black/70">Sen (Match Kupası)</div>
          <div className="mt-2 text-3xl font-black tabular-nums text-black drop-shadow-[2px_2px_0px_rgba(0,0,0,0.2)]">
            {myTrophies}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="text-xs font-black uppercase tracking-wide text-black/70">Rakip (Match Kupası)</div>
          <div className="mt-2 text-3xl font-black tabular-nums text-black drop-shadow-[2px_2px_0px_rgba(0,0,0,0.2)]">
            {oppTrophies}
          </div>
        </motion.div>
      </div>

      <motion.button
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        onClick={onReturn}
        className="mt-6 w-full rounded-xl border-4 border-black bg-lime-400 px-5 py-4 text-base font-black uppercase tracking-wide text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-lime-300 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
      >
        🏠 Lobby'ye Dön
      </motion.button>
    </motion.section>
  );
}
