"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAnonAuth } from "@/features/auth/useAnonAuth";
import { createInvite, joinInvite } from "@/features/match/services/match.api";

export default function HomePage() {
  const router = useRouter();
  const { ready, user } = useAnonAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready) return <div className="opacity-70">Hazırlanıyor…</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-neutral-900 p-4">
        <div className="text-sm opacity-70">UID</div>
        <div className="font-mono text-xs break-all">{user?.uid}</div>
      </div>

      <button
        className="w-full rounded-2xl bg-white px-4 py-3 text-black font-semibold disabled:opacity-60"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { matchId, code } = await createInvite();
            // istersek kodu burada gösteririz; şimdilik direkt match’e gidelim
            router.push(`/match/${matchId}?code=${code}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        Davet Kodu Oluştur
      </button>

      <div className="rounded-2xl bg-neutral-900 p-4 space-y-3">
        <div className="text-sm font-semibold">Koda Katıl</div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Örn: A1B2C3"
          className="w-full rounded-xl bg-neutral-800 px-3 py-3 outline-none"
        />
        <button
          className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-black font-semibold disabled:opacity-60"
          disabled={busy || code.length < 4}
          onClick={async () => {
            setBusy(true);
            try {
              const { matchId } = await joinInvite(code.trim());
              router.push(`/match/${matchId}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          Katıl
        </button>
      </div>

      <div className="text-xs opacity-60">
        Random matchmaking’i 2. aşamada ekliyoruz.
      </div>
    </div>
  );
}
