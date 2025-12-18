"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { auth } from "@/lib/firebase/client";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";

import { createInvite, joinInvite } from "@/features/match/services/match.api";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function HomePage() {
  const router = useRouter();

  const [userUid, setUserUid] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Invite modal/state
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canJoin = useMemo(() => joinCode.trim().length >= 4, [joinCode]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUserUid(u.uid);
        return;
      }
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error(e);
        setError("Anon giriş yapılamadı. Emulator/auth ayarlarını kontrol et.");
      }
    });
    return () => unsub();
  }, []);

  const onCreateInvite = async () => {
    setError(null);
    setCopied(false);
    setBusy("create");
    try {
      const res = await createInvite();
      // res: { code, matchId }
      setCreatedInviteCode(res.code);
      setCreatedMatchId(res.matchId);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Davet oluşturulamadı. Functions çalışıyor mu?");
    } finally {
      setBusy(null);
    }
  };

  const onCopy = async () => {
    if (!createdInviteCode) return;
    try {
      await navigator.clipboard.writeText(createdInviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setError("Kopyalanamadı. Kod: " + createdInviteCode);
    }
  };

  const onGoToMatch = () => {
    if (!createdMatchId) return;
    router.push(`/match/${createdMatchId}`);
  };

  const onJoin = async () => {
    setError(null);
    setBusy("join");
    try {
      const code = joinCode.trim().toUpperCase();
      const res = await joinInvite(code); // backend { code } bekliyor, wrapper hallediyor
      router.push(`/match/${res.matchId}`);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Koda katılım başarısız. Kod yanlış olabilir.");
    } finally {
      setBusy(null);
    }
  };

  const closeCreated = () => {
    setCreatedInviteCode(null);
    setCreatedMatchId(null);
    setCopied(false);
  };

  return (
    <main className="min-h-dvh bg-linear-to-b from-neutral-950 via-neutral-950 to-neutral-900 text-neutral-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-neutral-900/60 px-3 py-1 text-xs text-neutral-300 ring-1 ring-neutral-800">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Firebase Emulator • Local Dev
          </div>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight">YKS Arena</h1>
          <p className="mt-2 max-w-xl text-neutral-300">
            1v1 trivia. Davet oluştur, kodu paylaş, maça gir.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Create */}
          <section className="rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
            <h2 className="text-lg font-semibold">Davet oluştur</h2>
            <p className="mt-1 text-sm text-neutral-300">Kod üret ve arkadaşına gönder.</p>

            <button
              onClick={onCreateInvite}
              disabled={busy !== null}
              className={cx(
                "mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold",
                "bg-emerald-500 text-neutral-950 hover:bg-emerald-400",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
            >
              {busy === "create" ? "Oluşturuluyor..." : "Davet Oluştur"}
            </button>

            <div className="mt-4 text-xs text-neutral-400">
              Debug: {userUid ? "uid hazır" : "auth bekleniyor..."}
            </div>
          </section>

          {/* Join */}
          <section className="rounded-2xl bg-neutral-900/60 p-5 ring-1 ring-neutral-800">
            <h2 className="text-lg font-semibold">Koda katıl</h2>
            <p className="mt-1 text-sm text-neutral-300">Arkadaşının davet kodunu gir.</p>

            <div className="mt-4">
              <label className="text-xs text-neutral-400">Davet Kodu</label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Örn: A1B2C3"
                className={cx(
                  "mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950/60",
                  "px-4 py-3 text-sm text-neutral-100 outline-none",
                  "focus:border-neutral-700"
                )}
              />
            </div>

            <button
              onClick={onJoin}
              disabled={!canJoin || busy !== null}
              className={cx(
                "mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold",
                "bg-neutral-100 text-neutral-950 hover:bg-white",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
            >
              {busy === "join" ? "Katılınıyor..." : "Maça Katıl"}
            </button>

            <div className="mt-4 text-xs text-neutral-500">
              İpucu: Kodları büyük/küçük harf fark etmez, otomatik büyütür.
            </div>
          </section>
        </div>

        {/* Created Invite Modal */}
        {createdInviteCode && createdMatchId && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-3xl bg-neutral-950 p-5 ring-1 ring-neutral-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">Davet hazır</h3>
                  <p className="mt-1 text-sm text-neutral-300">
                    Kodu kopyala ve arkadaşına gönder.
                  </p>
                </div>
                <button
                  onClick={closeCreated}
                  className="rounded-xl bg-neutral-900 px-3 py-2 text-sm text-neutral-200 ring-1 ring-neutral-800 hover:bg-neutral-800"
                >
                  Kapat
                </button>
              </div>

              <div className="mt-4 rounded-2xl bg-neutral-900/60 p-4 ring-1 ring-neutral-800">
                <div className="text-xs text-neutral-400">Davet Kodu</div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="select-all text-3xl font-bold tracking-widest">
                    {createdInviteCode}
                  </div>
                  <button
                    onClick={onCopy}
                    className="rounded-xl bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-white"
                  >
                    {copied ? "Kopyalandı" : "Kopyala"}
                  </button>
                </div>
              </div>

              <button
                onClick={onGoToMatch}
                className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-neutral-950 hover:bg-emerald-400"
              >
                Maça Geç
              </button>

              <div className="mt-3 text-xs text-neutral-500">
                Match: <span className="font-mono">{createdMatchId}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
