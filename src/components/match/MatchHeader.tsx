"use client";

import { Home as HomeIcon } from "lucide-react";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function MatchHeader({
  status,
  isMyTurn,
  onHome,
}: {
  status: string;
  isMyTurn: boolean;
  onHome: () => void;
}) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <button
        onClick={onHome}
        className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900/60 px-3 py-2 text-sm font-semibold text-neutral-200 ring-1 ring-neutral-800 hover:bg-neutral-900"
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
      </div>
    </div>
  );
}
