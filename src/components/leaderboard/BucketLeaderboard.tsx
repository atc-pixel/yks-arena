"use client";

import { motion } from "framer-motion";
import type { LeagueBucket } from "@/lib/validation/schemas";

type BucketLeaderboardProps = {
  bucket: LeagueBucket | null;
  uid: string | null;
  currentLeague: string;
  weeklyTrophies: number;
  userRank: number | null;
  isInTeneke: boolean;
  leagueTier: string;
};

/**
 * Bucket Leaderboard Component
 * 
 * Architecture Decision:
 * - Mevcut lig, haftalık kupa ve sıralama bilgilerini içerir
 * - Player listesini gösterir
 * - Component dumb kalır, tüm data props'tan gelir
 */
export function BucketLeaderboard({
  bucket,
  uid,
  currentLeague,
  weeklyTrophies,
  userRank,
  isInTeneke,
  leagueTier,
}: BucketLeaderboardProps) {
  // League tier colors
  const tierColors: Record<string, { bg: string; border: string; text: string }> = {
    Teneke: { bg: "bg-gray-200", border: "border-gray-400", text: "text-gray-800" },
    Bronze: { bg: "bg-amber-200", border: "border-amber-400", text: "text-amber-900" },
    Silver: { bg: "bg-gray-300", border: "border-gray-500", text: "text-gray-900" },
    Gold: { bg: "bg-yellow-200", border: "border-yellow-400", text: "text-yellow-900" },
    Platinum: { bg: "bg-cyan-200", border: "border-cyan-400", text: "text-cyan-900" },
    Diamond: { bg: "bg-purple-200", border: "border-purple-400", text: "text-purple-900" },
  };

  const tierColor = tierColors[leagueTier] || tierColors.Teneke;

  // Teneke'deki kullanıcıya özel mesaj
  if (isInTeneke) {
    return (
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="rounded-3xl border-4 border-black bg-gradient-to-br from-gray-100 to-gray-200 p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
      >
        <div className="text-center">
          <div className="mb-4 text-6xl">🥫</div>
          <h2 className="mb-2 text-2xl font-black text-gray-800">Teneke Ligi</h2>
          <p className="mb-6 text-lg font-bold text-gray-600">
            Henüz bir lige girmedin!
          </p>
          <div className="rounded-2xl border-4 border-black bg-yellow-300 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-lg font-black text-black">
              🎯 Lige girmek için soru cevapla!
            </p>
            <p className="mt-2 text-sm font-bold text-black/70">
              İlk doğru cevabınla Bronze Ligine yükseleceksin.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (!bucket || bucket.players.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="rounded-3xl border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
    >
      {/* User Info Section */}
      <div className={`mb-6 rounded-xl border-4 ${tierColor.border} ${tierColor.bg} p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`}>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-black/70">Mevcut Lig</div>
            <div className={`mt-1 text-xl font-black uppercase ${tierColor.text}`}>
              {currentLeague}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs font-bold uppercase tracking-wide text-black/70">Haftalık Kupa</div>
            <div className={`mt-1 text-xl font-black ${tierColor.text}`}>
              {weeklyTrophies}
            </div>
          </div>
          {userRank && (
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-wide text-black/70">Sıralama</div>
              <div className="mt-1 text-xl font-black text-black">#{userRank} / {bucket.players.length}</div>
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard Title */}
      <div className="mb-4 text-lg font-black uppercase text-black">Bucket Liderlik Tablosu</div>

      {/* Players List */}
      <div className="space-y-2">
        {bucket.players
          .sort((a, b) => b.weeklyTrophies - a.weeklyTrophies)
          .map((player, index) => {
            const rank = index + 1;
            const isTop5 = rank <= 5;
            const isBottom5 = bucket.players.length === 30 && rank > 25;
            const isCurrentUser = player.uid === uid;
            const willGoToTeneke = player.weeklyTrophies === 0;

            let bgColor = "bg-white";
            let borderColor = "border-black";
            
            if (isCurrentUser) {
              bgColor = "bg-cyan-200";
              borderColor = "border-cyan-500";
            } else if (isTop5) {
              bgColor = "bg-lime-200";
              borderColor = "border-lime-500";
            } else if (isBottom5) {
              bgColor = "bg-orange-200";
              borderColor = "border-orange-500";
            } else if (willGoToTeneke) {
              bgColor = "bg-red-200";
              borderColor = "border-red-500";
            }

            return (
              <motion.div
                key={player.uid}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.05 * index }}
                className={`rounded-xl border-2 ${borderColor} ${bgColor} p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-black bg-black/10 text-lg font-black text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                      {rank}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-black text-black">
                          {isCurrentUser ? "Sen" : `Oyuncu ${player.uid.slice(0, 6)}`}
                        </div>
                        {isCurrentUser && (
                          <span className="rounded bg-cyan-500 px-2 py-0.5 text-xs font-black text-white">
                            SEN
                          </span>
                        )}
                        {isTop5 && (
                          <span className="rounded bg-lime-500 px-2 py-0.5 text-xs font-black text-white">
                            TERFİ
                          </span>
                        )}
                        {isBottom5 && (
                          <span className="rounded bg-orange-500 px-2 py-0.5 text-xs font-black text-white">
                            DÜŞÜŞ
                          </span>
                        )}
                        {willGoToTeneke && (
                          <span className="rounded bg-red-500 px-2 py-0.5 text-xs font-black text-white">
                            TENEKE
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs font-bold text-black/70">
                        Toplam: {player.totalTrophies} kupa
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-black">{player.weeklyTrophies}</div>
                    <div className="text-xs font-bold text-black/70">Haftalık</div>
                  </div>
                </div>
              </motion.div>
            );
          })}
      </div>
    </motion.div>
  );
}

