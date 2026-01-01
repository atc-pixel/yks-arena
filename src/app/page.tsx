"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useHomePageLogic } from "@/features/match/hooks/useHomePageLogic";
import { HeroSection } from "@/components/dashboard/HeroSection";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { QuickJoinSection } from "@/components/dashboard/QuickJoinSection";
import { InviteModal } from "@/components/dashboard/InviteModal";
import { ActiveMatchList } from "@/components/dashboard/ActiveMatchList";

/**
 * Home Page Component
 * 
 * Architecture Decision:
 * - Component "dumb" kalır, sadece UI render eder
 * - Tüm logic useHomePageLogic hook'unda
 * - UI parçaları ayrı component'lere bölündü
 */
export default function HomePage() {
  const {
    // User data
    user,
    userLoading,
    userError,
    uid,
    energy,
    activeMatchCount,

    // UI state
    joinCode,
    setJoinCode,
    busy,
    error,

    // Invite modal
    createdInviteCode,
    createdMatchId,
    copied,
    closeCreated,
    onCopy,
    onGoToMatch,
    onCancelInvite,

    // Computed
    canJoin,
    canPlay,
    startMatchReason,

    // Actions
    onCreateInvite,
    onJoin,

    // Active matches
    activeMatches,
    activeLoading,
    activeError,
  } = useHomePageLogic();

  return (
    <AppLayout user={user} userLoading={userLoading} userError={userError}>
      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* HERO */}
      <HeroSection
        activeMatchCount={activeMatchCount}
        energy={energy}
        canPlay={canPlay}
        busy={busy === "create"}
        startMatchReason={startMatchReason}
        onCreateInvite={onCreateInvite}
      />

      {/* STATS GRID */}
      <StatsGrid trophies={user?.trophies ?? 0} totalWins={user?.stats?.totalWins ?? 0} />

      {/* QUICK JOIN */}
      <QuickJoinSection
        joinCode={joinCode}
        setJoinCode={setJoinCode}
        canJoin={canJoin}
        busy={busy === "join"}
        energy={energy}
        onJoin={onJoin}
      />

      {/* ACTIVE MATCHES */}
      <ActiveMatchList
        uid={uid}
        energy={energy}
        matches={activeMatches}
        loading={activeLoading}
        error={activeError}
      />

      {/* INVITE MODAL */}
      {createdInviteCode && createdMatchId && (
        <InviteModal
          inviteCode={createdInviteCode}
          matchId={createdMatchId}
          copied={copied}
          busy={busy === "create"}
          onCopy={onCopy}
          onClose={closeCreated}
          onGoToMatch={onGoToMatch}
          onCancelInvite={onCancelInvite}
        />
      )}
    </AppLayout>
  );
}
