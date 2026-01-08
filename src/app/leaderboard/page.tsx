"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useLeaderboardPageLogic } from "@/features/league/hooks/useLeaderboardPageLogic";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { BucketLeaderboard } from "@/components/leaderboard/BucketLeaderboard";
import { ResetCountdown } from "@/components/leaderboard/ResetCountdown";
import { PromotionInfo } from "@/components/leaderboard/PromotionInfo";
import { RulesInfo } from "@/components/leaderboard/RulesInfo";

/**
 * Leaderboard Page Component
 * 
 * Architecture Decision:
 * - Component "dumb" kalır, sadece UI render eder
 * - Tüm logic useLeaderboardPageLogic hook'unda
 * - UI parçaları ayrı component'lere bölündü (modülerlik için)
 */
export default function LeaderboardPage() {
  const {
    user,
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

  return (
    <AppLayout user={user} userLoading={false} userError={null}>
      <div className="space-y-6">
        <LeaderboardHeader />

        <BucketLeaderboard
          bucket={bucket}
          uid={uid}
          currentLeague={currentLeague}
          weeklyTrophies={weeklyTrophies}
          userRank={userRank}
          isInTeneke={isInTeneke}
          leagueTier={leagueTier}
        />

        <ResetCountdown countdown={resetCountdown} />

        <PromotionInfo promotionInfo={promotionInfo} />

        <RulesInfo />
      </div>
    </AppLayout>
  );
}

