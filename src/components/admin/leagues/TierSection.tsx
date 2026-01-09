"use client";

import { motion } from "framer-motion";
import type { GroupedLeagues, TenekeUser } from "@/features/admin/hooks/useAllLeagues.rq";
import { TIER_COLORS, TIER_ICONS } from "./constants";
import { TenekeUsersList } from "./TenekeUsersList";
import { BucketCard } from "./BucketCard";
import { EmptyTierState } from "./EmptyTierState";

type TierSectionProps = {
  group: GroupedLeagues[number];
  index: number;
  tenekeUsers?: TenekeUser[];
};

export function TierSection({ group, index, tenekeUsers }: TierSectionProps) {
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

