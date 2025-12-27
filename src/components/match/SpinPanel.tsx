"use client";

import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function SpinPanel({
  isMyTurn,
  busy,
  onSpin,
}: {
  isMyTurn: boolean;
  busy: boolean;
  onSpin: () => void;
}) {
  return (
    <section className="rounded-3xl bg-neutral-900/60 p-6 ring-1 ring-neutral-800">
      <div className="text-sm text-neutral-300">Hazır mısın?</div>
      <div className="mt-1 text-2xl font-semibold">Çarkı Çevir</div>

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={onSpin}
        disabled={!isMyTurn || busy}
        className={cx(
          "mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-semibold",
          isMyTurn
            ? "bg-emerald-500 text-neutral-950 hover:bg-emerald-400"
            : "bg-neutral-800 text-neutral-400",
          "disabled:opacity-60 disabled:cursor-not-allowed"
        )}
      >
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Çevriliyor...
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" />
            Çarkı Çevir
          </>
        )}
      </motion.button>

      {!isMyTurn && (
        <div className="mt-3 text-sm text-neutral-400">
          Rakibin hamlesi bekleniyor.
        </div>
      )}
    </section>
  );
}
