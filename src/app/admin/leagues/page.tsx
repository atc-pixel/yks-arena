"use client";

import { motion } from "framer-motion";
import { useAnonAuth } from "@/features/auth/useAnonAuth";
import { useAllLeagues, useTenekeUsers } from "@/features/admin/hooks/useAllLeagues.rq";
import {
  StatCard,
  LoadingState,
  ErrorState,
  TierSection,
} from "@/components/admin/leagues";

/**
 * Admin Leagues Page
 * 
 * Architecture Decision:
 * - All logic in useAllLeagues hook
 * - Dumb UI components (extracted to @/components/admin/leagues)
 * - Real-time Firestore subscription
 * - Auth required for Firestore access
 */
export default function AdminLeaguesPage() {
  const { ready: authReady, error: authError } = useAnonAuth();
  const { leagues, loading, error } = useAllLeagues();
  const { tenekeUsers, loading: tenekeLoading } = useTenekeUsers();

  // Wait for auth first
  if (!authReady) {
    return (
      <div className="min-h-screen bg-neutral-950 p-8">
        <LoadingState message="Oturum açılıyor..." />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-neutral-950 p-8">
        <ErrorState message={authError} />
      </div>
    );
  }

  if (loading || tenekeLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 p-8">
        <LoadingState message="Ligler Yükleniyor..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 p-8">
        <ErrorState message={error.message} />
      </div>
    );
  }

  // Teneke hariç diğer liglerdeki oyuncular
  const bucketPlayers = leagues.reduce((sum, g) => sum + g.totalPlayers, 0);
  const totalPlayers = bucketPlayers + tenekeUsers.length;
  const totalBuckets = leagues.reduce((sum, g) => sum + g.buckets.length, 0);

  return (
    <div className="min-h-screen bg-neutral-950 p-4 md:p-8">
      {/* Header */}
      <motion.header
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-8"
      >
        <div className="rounded-2xl border-4 border-black bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <h1 className="text-center font-black text-4xl md:text-5xl text-white drop-shadow-[3px_3px_0px_rgba(0,0,0,1)]">
            🏟️ LİG YÖNETİMİ
          </h1>
          <p className="mt-2 text-center text-white/90 font-bold">
            Admin Panel • Tüm Ligler & Bucket&apos;lar
          </p>
        </div>
      </motion.header>

      {/* Stats Bar */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <StatCard label="Toplam Oyuncu" value={totalPlayers} icon="👥" />
        <StatCard label="Toplam Bucket" value={totalBuckets} icon="📦" />
        <StatCard label="Aktif Tier" value={leagues.filter(g => g.buckets.length > 0).length} icon="🏆" />
        <StatCard label="Sezon" value="S1" icon="📅" />
      </motion.div>

      {/* Tiers */}
      <div className="space-y-8">
        {leagues.map((group, idx) => (
          <TierSection 
            key={group.tier} 
            group={group} 
            index={idx} 
            tenekeUsers={group.tier === "Teneke" ? tenekeUsers : undefined}
          />
        ))}
      </div>

      {/* Footer */}
      <footer className="mt-12 text-center text-neutral-500 text-sm">
        <p>💡 Real-time güncellemeler aktif</p>
      </footer>
    </div>
  );
}
