"use client";

import { useEffect, useMemo, useState } from "react";

export function TurnTimer({ deadlineMs }: { deadlineMs: number }) {
  // Render purity: Date.now() çağırma. İlk değeri effect içinde set ediyoruz.
  const [now, setNow] = useState(0);

  useEffect(() => {
    // react-hooks/set-state-in-effect kuralı: setState'i effect body'de direkt çağırma.
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
    };
  }, []);

  const remaining = useMemo(() => Math.max(0, deadlineMs - now), [deadlineMs, now]);
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="rounded-xl bg-neutral-900 px-3 py-2 text-sm">
      Kalan: <span className="font-semibold">{seconds}s</span>
    </div>
  );
}
