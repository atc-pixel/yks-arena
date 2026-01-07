"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useLeaderboardPageLogic } from "@/features/league/hooks/useLeaderboardPageLogic";
import { motion } from "framer-motion";
import { Trophy, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

/**
 * Leaderboard Page Component
 * 
 * Architecture Decision:
 * - Component "dumb" kalır, sadece UI render eder
 * - Tüm logic useLeaderboardPageLogic hook'unda
 * - UI parçaları ayrı component'lere bölündü
 */
export default function LeaderboardPage() {
  const {
    user,
    leagueMeta,
    bucket,
    currentLeague,
    weeklyTrophies,
    isInTeneke,
    userRank,
    leagueTier,
    resetCountdown,
    promotionInfo,
    loading,
    error,
    ready,
    uid,
  } = useLeaderboardPageLogic();

  if (!ready || loading) {
    return (
      <AppLayout user={user} userLoading={loading} userError={error?.message}>
        <div className="rounded-3xl border-4 border-black bg-white p-8 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="text-lg font-black text-black">Yükleniyor...</div>
        </div>
      </AppLayout>
    );
  }

  // Don't block UI on leagueMeta error (it's optional for basic functionality)
  // if (error) {
  //   return (
  //     <AppLayout user={user} userLoading={false} userError={error?.message}>
  //       <div className="rounded-3xl border-4 border-black bg-red-400 p-6 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
  //         <div className="text-lg font-black text-black">Hata: {error?.message}</div>
  //       </div>
  //     </AppLayout>
  //   );
  // }

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

  return (
    <AppLayout user={user} userLoading={false} userError={null}>
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="rounded-3xl border-4 border-black bg-linear-to-br from-cyan-400 via-pink-400 to-yellow-400 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="flex items-center gap-3">
            <Trophy className="h-8 w-8 text-black" />
            <h1 className="text-2xl font-black uppercase tracking-wide text-black">Liderlik Tablosu</h1>
          </div>
        </motion.div>

        {/* Current League Card */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className={`rounded-3xl border-4 ${tierColor.border} ${tierColor.bg} p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]`}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold uppercase tracking-wide text-black/70">Mevcut Lig</div>
              <div className={`mt-1 text-3xl font-black uppercase ${tierColor.text}`}>
                {currentLeague}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold uppercase tracking-wide text-black/70">Haftalık Kupa</div>
              <div className={`mt-1 text-3xl font-black ${tierColor.text}`}>
                {weeklyTrophies}
              </div>
            </div>
          </div>

          {!isInTeneke && userRank && (
            <div className="mt-4 rounded-xl border-2 border-black bg-white/80 p-3">
              <div className="text-sm font-bold text-black/70">Sıralama</div>
              <div className="mt-1 text-2xl font-black text-black">#{userRank} / {bucket?.players.length ?? 30}</div>
            </div>
          )}

          {isInTeneke && (
            <div className="mt-4 rounded-xl border-2 border-black bg-white/80 p-3">
              <div className="text-sm font-bold text-black/70">Durum</div>
              <div className="mt-1 text-lg font-black text-black">Sınırsız Havuz</div>
            </div>
          )}
        </motion.div>

        {/* Reset Countdown */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="rounded-3xl border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="mb-4 text-center">
            <div className="text-sm font-bold uppercase tracking-wide text-black/70">Sıfırlanmaya Kalan Süre</div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <div className="rounded-xl border-2 border-black bg-cyan-400 p-3 text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <div className="text-xs font-bold text-black/70">Gün</div>
                <div className="mt-1 text-2xl font-black text-black">{resetCountdown.days}</div>
              </div>
              <div className="rounded-xl border-2 border-black bg-pink-400 p-3 text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <div className="text-xs font-bold text-black/70">Saat</div>
                <div className="mt-1 text-2xl font-black text-black">{resetCountdown.hours}</div>
              </div>
              <div className="rounded-xl border-2 border-black bg-yellow-400 p-3 text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <div className="text-xs font-bold text-black/70">Dakika</div>
                <div className="mt-1 text-2xl font-black text-black">{resetCountdown.minutes}</div>
              </div>
              <div className="rounded-xl border-2 border-black bg-lime-400 p-3 text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <div className="text-xs font-bold text-black/70">Saniye</div>
                <div className="mt-1 text-2xl font-black text-black">{resetCountdown.seconds}</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Promotion/Demotion Info */}
        {promotionInfo && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-3"
          >
            {promotionInfo.qualifiesForPromotion && (
              <div className="rounded-2xl border-4 border-black bg-lime-400 p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-6 w-6 text-black" />
                  <div>
                    <div className="font-black uppercase text-black">Terfi Hakkı Kazandın! 🚀</div>
                    <div className="mt-1 text-sm font-bold text-black/80">
                      İlk 5'te olduğun için yukarı lige çıkacaksın.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {promotionInfo.willDemote && (
              <div className="rounded-2xl border-4 border-black bg-orange-400 p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center gap-3">
                  <TrendingDown className="h-6 w-6 text-black" />
                  <div>
                    <div className="font-black uppercase text-black">Düşme Riski! ⚠️</div>
                    <div className="mt-1 text-sm font-bold text-black/80">
                      Son 5'te olduğun için aşağı lige düşeceksin.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {promotionInfo.willGoToTeneke && (
              <div className="rounded-2xl border-4 border-black bg-red-400 p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-6 w-6 text-black" />
                  <div>
                    <div className="font-black uppercase text-black">Teneke Lige Gidiyorsun! 📦</div>
                    <div className="mt-1 text-sm font-bold text-black/80">
                      0 kupa ile tüm liglerden Teneke'ye düşülür.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Bucket Leaderboard */}
        {!isInTeneke && bucket && bucket.players.length > 0 && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="rounded-3xl border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
          >
            <div className="mb-4 text-lg font-black uppercase text-black">Bucket Liderlik Tablosu</div>
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
                              {isTop5 && !isCurrentUser && (
                                <span className="rounded bg-lime-500 px-2 py-0.5 text-xs font-black text-white">
                                  TERFİ
                                </span>
                              )}
                              {isBottom5 && !isCurrentUser && (
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
        )}

        {/* Rules Info */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="rounded-3xl border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="mb-3 text-lg font-black uppercase text-black">Kurallar</div>
          <ul className="space-y-2 text-sm font-bold text-black/80">
            <li className="flex items-start gap-2">
              <span className="text-black">•</span>
              <span>İlk 5 sıra: Yukarı lige terfi eder</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-black">•</span>
              <span>Son 5 sıra: Aşağı lige düşer (Bronz hariç)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-black">•</span>
              <span>0 kupa: Tüm liglerden Teneke'ye düşülür</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-black">•</span>
              <span>Haftalık sıfırlama: Her Pazar 23:59</span>
            </li>
          </ul>
        </motion.div>
      </div>
    </AppLayout>
  );
}

