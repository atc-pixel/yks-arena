import { motion } from "framer-motion";
import { Trophy, Timer, Target, Zap } from "lucide-react";

type Props = {
  label: "Sen" | "Rakip";
  uid: string | null;
  trophies: number;

  correct: number;
  answered: number;
  avgTimeText: string; // "2.6s"
  fastestCorrectText: string; // "1.4s"
  highlight?: "WINNER" | "LOSER" | "NONE";
};

export function PlayerResultCard({
  label,
  uid,
  trophies,
  correct,
  answered,
  avgTimeText,
  fastestCorrectText,
  highlight = "NONE",
}: Props) {
  const isMe = label === "Sen";

  const bg =
    highlight === "WINNER"
      ? "bg-linear-to-br from-lime-400 to-emerald-500"
      : highlight === "LOSER"
        ? "bg-linear-to-br from-rose-400 to-red-500"
        : isMe
          ? "bg-linear-to-br from-pink-400 to-fuchsia-500"
          : "bg-linear-to-br from-cyan-400 to-blue-500";

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className={[
        "rounded-2xl border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]",
        bg,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-black/70">{label}</div>
          <div className="mt-2 rounded-lg border-2 border-black bg-white px-3 py-2 text-xs font-mono font-bold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            UID: {uid ?? "—"}
          </div>
        </div>

        <div className="rounded-xl border-4 border-black bg-white px-4 py-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-black" />
            <div className="text-xs font-black uppercase tracking-wide text-black/70">Kupalar</div>
          </div>
          <div className="mt-1 text-4xl font-black tabular-nums text-black">{trophies}</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-black" />
            <div className="text-xs font-black uppercase text-black/70">Doğru</div>
          </div>
          <div className="mt-1 text-3xl font-black tabular-nums text-black">{correct}</div>
        </div>

        <div className="rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-black" />
            <div className="text-xs font-black uppercase text-black/70">Cevap</div>
          </div>
          <div className="mt-1 text-3xl font-black tabular-nums text-black">{answered}</div>
        </div>

        <div className="rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-black" />
            <div className="text-xs font-black uppercase text-black/70">Ortalama</div>
          </div>
          <div className="mt-1 text-2xl font-black tabular-nums text-black">{avgTimeText}</div>
        </div>

        <div className="rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-black" />
            <div className="text-xs font-black uppercase text-black/70">En hızlı doğru</div>
          </div>
          <div className="mt-1 text-2xl font-black tabular-nums text-black">{fastestCorrectText}</div>
        </div>
      </div>
    </motion.section>
  );
}

