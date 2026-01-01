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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-neutral-950 p-5 ring-1 ring-neutral-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Davet hazır</h3>
            <p className="mt-1 text-sm text-neutral-300">Kodu kopyala ve arkadaşına gönder.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl bg-neutral-900 px-3 py-2 text-sm text-neutral-200 ring-1 ring-neutral-800 hover:bg-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-neutral-900/60 p-4 ring-1 ring-neutral-800">
          <div className="text-xs text-neutral-400">Davet Kodu</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="select-all text-3xl font-bold tracking-widest">{inviteCode}</div>
            <button
              onClick={onCopy}
              className="inline-flex items-center gap-2 rounded-2xl bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-white"
            >
              <Copy className="h-4 w-4" />
              {copied ? "Kopyalandı" : "Kopyala"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={onCancelInvite}
            disabled={busy}
            className={cn(
              "w-full rounded-2xl px-4 py-3 text-sm font-semibold",
              "bg-neutral-900 text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-800",
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
          >
            {busy ? "İşleniyor..." : "Davet İptal"}
          </button>

          <button
            onClick={onGoToMatch}
            disabled={busy}
            className={cn(
              "w-full rounded-2xl px-4 py-3 text-sm font-semibold",
              "bg-emerald-500 text-neutral-950 hover:bg-emerald-400",
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
          >
            Maça Geç
          </button>
        </div>

        <div className="mt-3 text-xs text-neutral-500">
          Match: <span className="font-mono">{matchId}</span>
        </div>
      </div>
    </div>
  );
}

