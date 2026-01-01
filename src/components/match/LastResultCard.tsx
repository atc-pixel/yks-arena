/**
 * Last Result Card Component
 * 
 * Architecture Decision:
 * - Last result display ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import type { TurnLastResult } from "@/lib/validation/schemas";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Props = {
  lastResult: TurnLastResult;
};

export function LastResultCard({ lastResult }: Props) {
  return (
    <div
      className={cx(
        "mb-6 rounded-2xl p-4 ring-1",
        lastResult.isCorrect
          ? "bg-emerald-500/10 ring-emerald-500/30 text-emerald-200"
          : "bg-red-500/10 ring-red-500/30 text-red-200"
      )}
    >
      <div className="text-sm font-semibold">
        {lastResult.isCorrect ? "✅ Doğru" : "❌ Yanlış"}
      </div>

      <div className="mt-2 text-sm text-neutral-200">
        Kategori: <b>{lastResult.symbol}</b> • Senin cevabın: <b>{lastResult.answer}</b> • Doğru:{" "}
        <b>{lastResult.correctAnswer}</b>
      </div>

      {lastResult.earnedSymbol && (
        <div className="mt-2 text-sm text-neutral-100">
          🏆 Kazanılan sembol: <b>{lastResult.earnedSymbol}</b>
        </div>
      )}
    </div>
  );
}

