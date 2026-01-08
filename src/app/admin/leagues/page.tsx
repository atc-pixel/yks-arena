"use client";

import { motion } from "framer-motion";
import { useAnonAuth } from "@/features/auth/useAnonAuth";
import { useAllLeagues, useTenekeUsers, type GroupedLeagues, type AdminBucket, type TenekeUser } from "@/features/admin/hooks/useAllLeagues.rq";
import type { LeagueTier } from "@/lib/validation/schemas";

/**
 * Admin Leagues Page
 * 
 * 🎨 ANDY'S POP-ART DESIGN:
 * - Bold borders, hard shadows
 * - Tier-specific vibrant colors
 * - Animated cards with micro-interactions
 * 
 * 💻 DEV's ARCHITECTURE:
 * - All logic in useAllLeagues hook
 * - Dumb UI components
 * - Real-time Firestore subscription
 * - Auth required for Firestore access
 */

// Tier renk paleti - Pop-Art vibes 💥
const TIER_COLORS: Record<LeagueTier, { bg: string; border: string; text: string; accent: string }> = {
  Diamond: { bg: "bg-cyan-400", border: "border-cyan-600", text: "text-cyan-900", accent: "bg-cyan-200" },
  Platinum: { bg: "bg-violet-400", border: "border-violet-600", text: "text-violet-900", accent: "bg-violet-200" },
  Gold: { bg: "bg-yellow-400", border: "border-yellow-600", text: "text-yellow-900", accent: "bg-yellow-200" },
  Silver: { bg: "bg-slate-300", border: "border-slate-500", text: "text-slate-900", accent: "bg-slate-100" },
  Bronze: { bg: "bg-orange-400", border: "border-orange-600", text: "text-orange-900", accent: "bg-orange-200" },
  Teneke: { bg: "bg-neutral-400", border: "border-neutral-600", text: "text-neutral-900", accent: "bg-neutral-200" },
};

// Tier ikonları
const TIER_ICONS: Record<LeagueTier, string> = {
  Diamond: "💎",
  Platinum: "🏆",
  Gold: "🥇",
  Silver: "🥈",
  Bronze: "🥉",
  Teneke: "🥫",
};

export default function AdminLeaguesPage() {
  // Auth required for Firestore access
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

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
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

function TierSection({ group, index, tenekeUsers }: { 
  group: GroupedLeagues[number]; 
  index: number;
  tenekeUsers?: TenekeUser[];
}) {
  const colors = TIER_COLORS[group.tier];
  const icon = TIER_ICONS[group.tier];
  const hasBuckets = group.buckets.length > 0;
  const isTeneke = group.tier === "Teneke";
  const tenekeCount = tenekeUsers?.length ?? 0;

  return (
    <motion.section
      initial={{ x: index % 2 === 0 ? -50 : 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: index * 0.1 }}
    >
      {/* Tier Header */}
      <div className={`rounded-t-2xl border-4 border-b-0 border-black ${colors.bg} p-4 shadow-[4px_-4px_0px_0px_rgba(0,0,0,1)]`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{icon}</span>
            <div>
              <h2 className={`font-black text-2xl ${colors.text}`}>{group.tier.toUpperCase()}</h2>
              <p className={`text-sm font-bold ${colors.text} opacity-70`}>
                {isTeneke 
                  ? `Sınırsız Havuz • ${tenekeCount} Oyuncu`
                  : `${group.buckets.length} Bucket • ${group.totalPlayers} Oyuncu`
                }
              </p>
            </div>
          </div>
          <div className={`rounded-full ${colors.accent} px-4 py-2 font-black ${colors.text}`}>
            {isTeneke ? tenekeCount : group.totalPlayers} 🎮
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={`rounded-b-2xl border-4 border-t-2 border-black ${colors.accent} p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`}>
        {isTeneke ? (
          <TenekeUsersList users={tenekeUsers ?? []} />
        ) : hasBuckets ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.buckets.map((bucket) => (
              <BucketCard key={`${bucket.tier}_${bucket.seasonId}_${bucket.bucketNumber}`} bucket={bucket} />
            ))}
          </div>
        ) : (
          <EmptyTierState tier={group.tier} />
        )}
      </div>
    </motion.section>
  );
}

/** Teneke kullanıcı listesi - bucket yok, direkt users collection'dan */
function TenekeUsersList({ users }: { users: TenekeUser[] }) {
  if (users.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-6xl mb-3 opacity-50">🥫</div>
        <p className="text-neutral-500 font-bold">Teneke&apos;de henüz kimse yok</p>
        <p className="text-neutral-400 text-sm">Yeni oyuncular buraya düşer</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {users.map((user, idx) => (
        <motion.div
          key={user.uid}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.02 }}
          className="rounded-xl border-2 border-black bg-white p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 text-center font-black text-neutral-400">
                {idx + 1}
              </span>
              <div>
                <div className="font-bold text-sm text-black truncate max-w-[120px]">
                  {user.displayName}
                </div>
                <div className="text-xs text-neutral-500 font-mono">
                  {user.uid.slice(0, 10)}...
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-black text-sm text-black">{user.trophies}🏆</div>
              <div className="text-xs text-neutral-500">Toplam</div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function BucketCard({ bucket }: { bucket: AdminBucket }) {
  const colors = TIER_COLORS[bucket.tier];
  const sortedPlayers = [...bucket.players].sort((a, b) => b.weeklyTrophies - a.weeklyTrophies);
  const isFull = bucket.status === "full";

  return (
    <motion.div
      whileHover={{ scale: 1.02, rotate: 0.5 }}
      whileTap={{ scale: 0.98 }}
      className={`rounded-xl border-3 border-black bg-white p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all`}
    >
      {/* Bucket Header */}
      <div className="flex items-center justify-between mb-3">
        <div className={`rounded-lg ${colors.bg} px-3 py-1 font-black text-sm ${colors.text}`}>
          #{bucket.bucketNumber}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
            isFull ? "bg-red-200 text-red-800" : "bg-green-200 text-green-800"
          }`}>
            {isFull ? "DOLU" : "AKTİF"}
          </span>
          <span className="text-sm font-bold text-neutral-600">
            {bucket.players.length}/30
          </span>
        </div>
      </div>

      {/* Players List */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {sortedPlayers.length === 0 ? (
          <p className="text-center text-neutral-400 text-sm py-4">Henüz oyuncu yok</p>
        ) : (
          sortedPlayers.map((player, idx) => (
            <div
              key={player.uid}
              className={`flex items-center justify-between px-2 py-1 rounded-lg ${
                idx < 3 ? "bg-yellow-50" : "bg-neutral-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-6 text-center font-black ${
                  idx === 0 ? "text-yellow-600" : idx === 1 ? "text-slate-500" : idx === 2 ? "text-orange-600" : "text-neutral-400"
                }`}>
                  {idx + 1}
                </span>
                <span className="font-mono text-xs text-neutral-600 truncate max-w-[100px]">
                  {player.uid.slice(0, 12)}...
                </span>
              </div>
              <span className="font-black text-sm text-black">
                {player.weeklyTrophies}🏆
              </span>
            </div>
          ))
        )}
      </div>

      {/* Bucket Footer */}
      <div className="mt-3 pt-3 border-t-2 border-dashed border-neutral-200">
        <div className="flex justify-between text-xs text-neutral-500">
          <span>Season: {bucket.seasonId}</span>
          <span>Status: {bucket.status}</span>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyTierState({ tier }: { tier: LeagueTier }) {
  return (
    <div className="text-center py-8">
      <div className="text-6xl mb-3 opacity-50">{TIER_ICONS[tier]}</div>
      <p className="text-neutral-500 font-bold">Bu ligde henüz bucket yok</p>
      <p className="text-neutral-400 text-sm">Oyuncular maç oynayınca bucket&apos;lar oluşacak</p>
    </div>
  );
}

function LoadingState({ message = "Yükleniyor..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="text-6xl mb-4"
      >
        🔄
      </motion.div>
      <p className="text-white font-bold text-xl">{message}</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border-4 border-red-500 bg-red-100 p-8 text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <div className="text-6xl mb-4">❌</div>
      <h2 className="text-2xl font-black text-red-800 mb-2">Hata Oluştu!</h2>
      <p className="text-red-600">{message}</p>
    </div>
  );
}

