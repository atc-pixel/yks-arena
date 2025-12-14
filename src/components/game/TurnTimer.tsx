"use client";

import { useEffect, useMemo, useState } from "react";

export function TurnTimer({ deadlineMs }: { deadlineMs: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = useMemo(() => Math.max(0, deadlineMs - now), [deadlineMs, now]);
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="rounded-xl bg-neutral-900 px-3 py-2 text-sm">
      Kalan: <span className="font-semibold">{seconds}s</span>
    </div>
  );
}
