/**
 * Invite Modal Component
 * 
 * Architecture Decision:
 * - Modal logic'i ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import { Copy, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Props = {
  inviteCode: string;
  matchId: string;
  copied: boolean;
  busy: boolean;
  onCopy: () => void;
  onClose: () => void;
  onGoToMatch: () => void;
  onCancelInvite: () => void;
};

import { motion, AnimatePresence } from "framer-motion";

export function InviteModal({
  inviteCode,
  matchId,
  copied,
  busy,
  onCopy,
  onClose,
  onGoToMatch,
  onCancelInvite,
}: Props) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
      >
        <motion.div
          initial={{ scale: 0.8, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 50 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="w-full max-w-lg rounded-3xl border-4 border-black bg-linear-to-br from-pink-400 via-purple-400 to-indigo-500 p-6 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-black uppercase tracking-wide text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.8)]">
                🎉 Davet Hazır!
              </h3>
              <p className="mt-2 text-sm font-bold text-black/80">
                Kodu kopyala ve arkadaşına gönder.
              </p>
            </div>
            <motion.button
              onClick={onCancelInvite}
              disabled={busy}
              whileHover={!busy ? { scale: 1.1, rotate: 90 } : {}}
              whileTap={{ scale: 0.9 }}
              className="rounded-xl border-4 border-black bg-white px-3 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-red-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <X className="h-5 w-5 text-black" />
            </motion.button>
          </div>

          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="mt-5 rounded-2xl border-4 border-black bg-white p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
          >
            <div className="mb-3 text-xs font-black uppercase tracking-wide text-black/60">
              Davet Kodu
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="select-all text-4xl font-black tracking-widest text-black drop-shadow-[2px_2px_0px_rgba(0,0,0,0.2)]">
                {inviteCode}
              </div>
              <motion.button
                onClick={onCopy}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center gap-2 rounded-xl border-4 border-black bg-cyan-400 px-4 py-2 text-sm font-black uppercase text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-cyan-300 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
              >
                <Copy className="h-4 w-4" />
                {copied ? "✓ Kopyalandı" : "Kopyala"}
              </motion.button>
            </div>
          </motion.div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <motion.button
              onClick={onCancelInvite}
              disabled={busy}
              whileHover={!busy ? { scale: 1.05, y: -2 } : {}}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "w-full rounded-xl border-4 border-black px-4 py-3 text-sm font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all",
                "bg-white text-black hover:bg-red-400 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
            >
              {busy ? "İşleniyor..." : "İptal"}
            </motion.button>

            <motion.button
              onClick={onGoToMatch}
              disabled={busy}
              whileHover={!busy ? { scale: 1.05, y: -2 } : {}}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "w-full rounded-xl border-4 border-black px-4 py-3 text-sm font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all",
                "bg-lime-400 text-black hover:bg-lime-300 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
            >
              Maça Geç 🚀
            </motion.button>
          </div>

          <div className="mt-4 rounded-lg border-2 border-black bg-white/80 px-3 py-2 text-xs font-bold text-black/60">
            Match: <span className="font-mono">{matchId}</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

