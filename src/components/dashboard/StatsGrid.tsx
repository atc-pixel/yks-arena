/**
 * Stats Grid Component
 * 
 * Architecture Decision:
 * - User stats display ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

type Props = {
  trophies: number;
  totalWins: number;
};

export function StatsGrid({ trophies, totalWins }: Props) {
  return (
    <section className="mt-4 grid grid-cols-2 gap-3">
      <div className="rounded-3xl bg-neutral-900/40 p-4 ring-1 ring-neutral-800">
        <div className="text-xs text-neutral-400">Toplam Kupa</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{trophies}</div>
        <div className="mt-1 text-xs text-neutral-500">Lifetime</div>
      </div>

      <div className="rounded-3xl bg-neutral-900/40 p-4 ring-1 ring-neutral-800">
        <div className="text-xs text-neutral-400">Zaferler</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{totalWins}</div>
        <div className="mt-1 text-xs text-neutral-500">Toplam</div>
      </div>
    </section>
  );
}

