"use client";

import { useEffect, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { Loader2, Sparkles, Disc3 } from "lucide-react";

import type { SymbolKey } from "@/lib/validation/schemas";
import { useSound } from "@/hooks/useSound";
import type { SpinResponse } from "@/features/match/services/match.api";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const SYMBOL_LABEL: Partial<Record<SymbolKey, string>> = {
  MATEMATIK: "Matematik",
  COGRAFYA: "Coğrafya",
  SPOR: "Spor",
  BILIM: "Bilim",
};

export function SpinPanel({
  canSpin,
  busy,
  onSpin,
  lastSymbol,
}: {
  canSpin: boolean;
  busy: boolean;
  onSpin: () => Promise<SpinResponse | void>;
  /** Pass match.turn.challengeSymbol to show the latest category */
  lastSymbol?: SymbolKey | null;
}) {
  const controls = useAnimation();
  const { playSpin, stopSpin, playClick } = useSound();

  const [spinning, setSpinning] = useState(false);
  const [revealSymbol, setRevealSymbol] = useState<SymbolKey | null>(null);

  // keep reveal in sync if parent updates the symbol while we're animating
  useEffect(() => {
    if (lastSymbol) setRevealSymbol(lastSymbol);
  }, [lastSymbol]);

  const startSpinAnim = () => {
    setSpinning(true);
    setRevealSymbol(null);
    // fast endless spin
    controls.start({
      rotate: 360,
      transition: { duration: 0.35, ease: "linear", repeat: Infinity },
    });
  };

  const stopSpinAnim = async () => {
    // slow stop + little overshoot
    await controls.start({
      rotate: 360 * 2,
      transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
    });
    setSpinning(false);
  };

  const handleSpin = async () => {
    if (!canSpin || busy || spinning) return;

    playClick();
    playSpin();

    try {
      startSpinAnim();
      const res = await onSpin();
      stopSpin();
      await stopSpinAnim();

      // Type-safe symbol extraction
      if (res && "symbol" in res) {
        const s = res.symbol;
        if (s) setRevealSymbol(s);
      }
    } catch {
      stopSpin();
      setSpinning(false);
      controls.stop();
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border-4 border-black bg-linear-to-br from-orange-400 via-pink-400 to-purple-500 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-black/70">Hamle</div>
          <div className="mt-1 text-3xl font-black uppercase tracking-wide text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.8)]">
            Çarkı Çevir
          </div>
        </div>

        <motion.div
          animate={controls}
          className={cx(
            "grid h-20 w-20 place-items-center rounded-xl border-4 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
            spinning && "shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
          )}
        >
          <Disc3 className="h-8 w-8 text-black" />
        </motion.div>
      </div>

      <motion.button
        whileHover={canSpin && !busy && !spinning ? { scale: 1.05, y: -2 } : {}}
        whileTap={{ scale: 0.95, y: 0 }}
        onClick={handleSpin}
        disabled={!canSpin || busy || spinning}
        className={cx(
          "mt-6 flex w-full items-center justify-center gap-2 rounded-xl border-4 border-black px-6 py-5 text-lg font-black uppercase tracking-wide shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
          "transition-all",
          canSpin
            ? "bg-lime-400 text-black hover:bg-lime-300 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            : "bg-neutral-300 text-neutral-600",
          "disabled:cursor-not-allowed"
        )}
      >
        {busy || spinning ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin" />
            Çevriliyor...
          </>
        ) : (
          <>
            <Sparkles className="h-6 w-6" />
            Çarkı Çevir
          </>
        )}
      </motion.button>

      {revealSymbol && !spinning && (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300 }}
          className="mt-5 rounded-xl border-4 border-black bg-white p-5 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="text-xs font-black uppercase tracking-wide text-black/70">Kategori</div>
          <div className="mt-2 text-2xl font-black uppercase text-black drop-shadow-[2px_2px_0px_rgba(0,0,0,0.2)]">
            {SYMBOL_LABEL[revealSymbol] ?? revealSymbol}
          </div>
        </motion.div>
      )}

      {!canSpin && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 rounded-lg border-2 border-black bg-white/90 px-3 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
        >
          ⏳ Rakibin hamlesi bekleniyor.
        </motion.div>
      )}
    </motion.section>
  );
}
