"use client";

import { useEffect, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { Loader2, Sparkles, Disc3 } from "lucide-react";

import type { SymbolKey } from "@/features/match/types";
import { useSound } from "@/hooks/useSound";

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
  onSpin: () => Promise<{ symbol?: SymbolKey } | void>;
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
      const res: any = await onSpin();
      stopSpin();
      await stopSpinAnim();

      const s: SymbolKey | undefined = res?.symbol;
      if (s) setRevealSymbol(s);
    } catch {
      stopSpin();
      setSpinning(false);
      controls.stop();
    }
  };

  return (
    <section className="rounded-3xl bg-neutral-900/60 p-6 ring-1 ring-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-neutral-400">Hamle</div>
          <div className="mt-1 text-2xl font-semibold">Çarkı Çevir</div>
        </div>

        <motion.div
          animate={controls}
          className={cx(
            "grid h-16 w-16 place-items-center rounded-2xl bg-neutral-950/50 ring-1 ring-neutral-800",
            spinning && "shadow-lg"
          )}
        >
          <Disc3 className="h-7 w-7 text-neutral-200" />
        </motion.div>
      </div>

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={handleSpin}
        disabled={!canSpin || busy || spinning}
        className={cx(
          "mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-b-4 px-5 py-4 text-base font-semibold shadow-lg",
          "transition-transform duration-150 active:scale-95",
          canSpin
            ? "bg-green-500 border-green-700 text-white hover:bg-green-400"
            : "bg-neutral-800 border-neutral-900 text-neutral-400",
          "disabled:opacity-70 disabled:cursor-not-allowed"
        )}
      >
        {busy || spinning ? (
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

      {revealSymbol && !spinning && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [0.5, 1.2, 1], opacity: 1 }}
          transition={{ duration: 0.45 }}
          className="mt-4 rounded-2xl bg-neutral-950/50 p-4 text-center ring-1 ring-neutral-800"
        >
          <div className="text-xs text-neutral-400">Kategori</div>
          <div className="mt-1 text-lg font-semibold text-neutral-100">
            {SYMBOL_LABEL[revealSymbol] ?? revealSymbol}
          </div>
        </motion.div>
      )}

      {!canSpin && (
        <div className="mt-3 text-sm text-neutral-400">Rakibin hamlesi bekleniyor.</div>
      )}
    </section>
  );
}
