"use client";

type StatCardProps = {
  label: string;
  value: string | number;
  icon: string;
};

export function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="rounded-xl border-4 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-shadow">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{icon}</span>
        <div>
          <div className="text-2xl font-black text-black">{value}</div>
          <div className="text-sm font-bold text-neutral-600">{label}</div>
        </div>
      </div>
    </div>
  );
}

