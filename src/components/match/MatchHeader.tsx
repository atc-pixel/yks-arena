/**
 * Match Header Component
 * 
 * Architecture Decision:
 * - Match status ve turn info ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import { Home as HomeIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { MatchStatus } from "@/lib/validation/schemas";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Props = {
  status: MatchStatus;
  isMyTurn: boolean;
  phase: string;
  onGoHome: () => void;
};

export function MatchHeader({ status, isMyTurn, phase, onGoHome }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <button
        onClick={onGoHome}
        className={cx(
          "inline-flex items-center gap-2 rounded-2xl bg-neutral-900/60 px-3 py-2 text-sm font-semibold text-neutral-200 ring-1 ring-neutral-800",
          "transition-transform active:scale-95"
        )}
      >
        <HomeIcon className="h-4 w-4" />
        Ana Sayfa
      </button>

      <div className="flex items-center gap-2">
        <span
          className={cx(
            "rounded-full px-3 py-1 text-xs font-semibold ring-1",
            status === "ACTIVE"
              ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
              : "bg-neutral-900 text-neutral-300 ring-neutral-800"
          )}
        >
          {status}
        </span>

        <span
          className={cx(
            "rounded-full px-3 py-1 text-xs font-semibold ring-1",
            isMyTurn
              ? "bg-emerald-500/20 text-emerald-200 ring-emerald-500/30"
              : "bg-neutral-900 text-neutral-300 ring-neutral-800"
          )}
        >
          {isMyTurn ? "Sıra sende" : "Rakipte"}
        </span>

        <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-neutral-300 ring-1 ring-neutral-800">
          Phase: <span className="font-semibold">{phase}</span>
        </span>
      </div>
    </div>
  );
}
