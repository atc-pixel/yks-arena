"use client";

export function Scoreboard({
  myTrophies,
  oppTrophies,
}: {
  myTrophies: number;
  oppTrophies: number;
}) {
  return (
    <div className="mb-5 grid gap-3 md:grid-cols-2">
      <div className="rounded-3xl bg-neutral-900/50 p-4 ring-1 ring-neutral-800">
        <div className="text-xs text-neutral-400">Sen</div>
        <div className="mt-1 text-lg font-semibold">{myTrophies} 🏆</div>
      </div>
      <div className="rounded-3xl bg-neutral-900/50 p-4 ring-1 ring-neutral-800">
        <div className="text-xs text-neutral-400">Rakip</div>
        <div className="mt-1 text-lg font-semibold">{oppTrophies} 🏆</div>
      </div>
    </div>
  );
}
