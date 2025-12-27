"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Play, Copy, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { useAnonAuth } from "@/features/auth/useAnonAuth";
import { useUser } from "@/features/users/hooks/useUser";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils/cn";

import { createInvite, joinInvite, cancelInvite } from "@/features/match/services/match.api";

import { useActiveMatches } from "@/features/match/hooks/useActiveMatches";
import { ActiveMatchList } from "@/components/dashboard/ActiveMatchList";

import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";



export default function HomePage() {
  const router = useRouter();

  // Auth + realtime user
  const { user: authUser, ready, error: authError } = useAnonAuth();
  const uid = authUser?.uid ?? null;
  const { user, loading: userLoading, error: userError } = useUser(uid);

  // UI state
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Invite modal/state (koruduk)
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  

  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

    // ✅ Invite beklerken rakip girince otomatik maça git
  useEffect(() => {
    if (!createdMatchId) return;

    const ref = doc(db, "matches", createdMatchId);

    const unsub = onSnapshot(ref, (snap) => {
      const m = snap.data() as any;
      if (!m) return;

      // Rakip join olduysa match ACTIVE olur (backend)
      if (m.status === "ACTIVE") {
        router.push(`/match/${createdMatchId}`);
      }
    });

    return () => unsub();
  }, [createdMatchId, router]);


  const canJoin = useMemo(() => joinCode.trim().length >= 4, [joinCode]);

  const energy = user?.economy?.energy ?? 0;
  const activeMatchCount = user?.presence?.activeMatchCount ?? 0;

  const canPlay = energy > 0 && activeMatchCount < energy;

  const { matches: activeMatches, loading: activeLoading, error: activeError } =
    useActiveMatches(uid);


  const playDisabledReason =
    energy <= 0 ? "Enerji Yok" : activeMatchCount >= energy ? "Maç Kotası Dolu" : null;

  const cannotStartNewMatch = energy <= activeMatchCount;
  const cannotPlayAtAll = energy === 0;

  const startMatchReason = cannotPlayAtAll
    ? "Şu an enerjin yok. Maç başlatmak için refilli bekle ya da hemen kutu aç!"
    : cannotStartNewMatch
      ? "Şu an yeni maç başlatamazsın."
      : null;


  const onCreateInvite = async () => {
    setError(null);
    setCopied(false);
    setBusy("create");
    try {
      const res = await createInvite();
      setCreatedInviteCode(res.code);
      setCreatedMatchId(res.matchId);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Davet oluşturulamadı.");
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

  const closeCreated = () => {
    setCreatedInviteCode(null);
    setCreatedMatchId(null);
    setCopied(false);
  };

  const onCancelInvite = async () => {
    if (!createdInviteCode) return;

    setError(null);
    setBusy("create");
    try {
      await cancelInvite(createdInviteCode);
      closeCreated();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Davet iptal edilemedi.");
    } finally {
      setBusy(null);
    }
  };

  const onJoin = async () => {
    setError(null);
    setBusy("join");
    try {
      const code = joinCode.trim().toUpperCase();
      const res = await joinInvite(code);
      router.push(`/match/${res.matchId}`);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Koda katılım başarısız.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppLayout user={user} userLoading={userLoading || !ready} userError={userError}>
      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* HERO */}
      <section className="rounded-3xl bg-neutral-900/40 p-5 ring-1 ring-neutral-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">YKS Arena</h1>
            <p className="mt-1 text-sm text-neutral-300">
              1v1 trivia. Enerjini yönet, kupaları topla.
            </p>
          </div>

          <div className="text-right text-xs text-neutral-400">
            <div className="tabular-nums">Maç: {activeMatchCount}</div>
            <div className="tabular-nums">Enerji: {energy}</div>
          </div>
        </div>

        <motion.button
          onClick={onCreateInvite}
          disabled={!canPlay || busy !== null}
          whileTap={{ scale: 0.98 }}
          animate={canPlay ? { scale: [1, 1.02, 1] } : { scale: 1 }}
          transition={canPlay ? { repeat: Infinity, duration: 1.6, ease: "easeInOut" } : undefined}
          className={cn(
            "mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-semibold",
            canPlay
              ? "bg-emerald-500 text-neutral-950 hover:bg-emerald-400"
              : "bg-neutral-800 text-neutral-400",
            "ring-1 ring-neutral-800 disabled:cursor-not-allowed"
          )}
        >
          <Play className="h-5 w-5" />
          {busy === "create" ? "Hazırlanıyor..." : "Maç Ara"}
        </motion.button>

        {startMatchReason && (
          <p className="mt-3 text-sm text-neutral-400">{startMatchReason}</p>
        )}

      </section>

      {/* STATS GRID */}
      <section className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-neutral-900/40 p-4 ring-1 ring-neutral-800">
          <div className="text-xs text-neutral-400">Toplam Kupa</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{user?.trophies ?? 0}</div>
          <div className="mt-1 text-xs text-neutral-500">Lifetime</div>
        </div>

        <div className="rounded-3xl bg-neutral-900/40 p-4 ring-1 ring-neutral-800">
          <div className="text-xs text-neutral-400">Zaferler</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{user?.stats?.totalWins ?? 0}</div>
          <div className="mt-1 text-xs text-neutral-500">Toplam</div>
        </div>
      </section>

      {/* QUICK JOIN (opsiyonel ama pratik) */}
      <section className="mt-4 rounded-3xl bg-neutral-900/40 p-5 ring-1 ring-neutral-800">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Koda katıl</h2>
            <p className="mt-1 text-sm text-neutral-300">Arkadaşının davet kodunu gir.</p>
          </div>
        </div>

        <div className="mt-4">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Örn: A1B2C3"
            className={cn(
              "w-full rounded-2xl border border-neutral-800 bg-neutral-950/50 px-4 py-3 text-sm text-neutral-100",
              "outline-none focus:border-neutral-700"
            )}
          />
        </div>

        <motion.button
          onClick={onJoin}
          disabled={!canJoin || busy !== null || energy <= 0}
          whileTap={{ scale: 0.98 }}
          className={cn(
            "mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold",
            "bg-neutral-100 text-neutral-950 hover:bg-white",
            "disabled:opacity-60 disabled:cursor-not-allowed"
          )}
        >
          {busy === "join" ? "Katılınıyor..." : "Maça Katıl"}
        </motion.button>

        {energy <= 0 && <p className="mt-2 text-xs text-neutral-500">Enerji 0 iken cevap veremezsin.</p>}
      </section>
      
      <ActiveMatchList
        uid={uid}
        energy={energy}
        matches={activeMatches}
        loading={activeLoading}
        error={activeError}
      />


      {/* CREATED INVITE MODAL (korundu, sadece ikonlarla güzelleşti) */}
      {createdInviteCode && createdMatchId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-neutral-950 p-5 ring-1 ring-neutral-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Davet hazır</h3>
                <p className="mt-1 text-sm text-neutral-300">Kodu kopyala ve arkadaşına gönder.</p>
              </div>
              <button
                onClick={closeCreated}
                className="rounded-2xl bg-neutral-900 px-3 py-2 text-sm text-neutral-200 ring-1 ring-neutral-800 hover:bg-neutral-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-neutral-900/60 p-4 ring-1 ring-neutral-800">
              <div className="text-xs text-neutral-400">Davet Kodu</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="select-all text-3xl font-bold tracking-widest">{createdInviteCode}</div>
                <button
                  onClick={onCopy}
                  className="inline-flex items-center gap-2 rounded-2xl bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-white"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Kopyalandı" : "Kopyala"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={onCancelInvite}
                disabled={busy !== null}
                className={cn(
                  "w-full rounded-2xl px-4 py-3 text-sm font-semibold",
                  "bg-neutral-900 text-neutral-100 ring-1 ring-neutral-800 hover:bg-neutral-800",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              >
                {busy ? "İşleniyor..." : "Davet İptal"}
              </button>

              <button
                onClick={onGoToMatch}
                disabled={busy !== null}
                className={cn(
                  "w-full rounded-2xl px-4 py-3 text-sm font-semibold",
                  "bg-emerald-500 text-neutral-950 hover:bg-emerald-400",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              >
                Maça Geç
              </button>
            </div>

            <div className="mt-3 text-xs text-neutral-500">
              Match: <span className="font-mono">{createdMatchId}</span>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
