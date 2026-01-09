"use client";

import { motion } from "framer-motion";
import type { AdminBucket } from "@/features/admin/hooks/useAllLeagues.rq";
import { TIER_COLORS } from "./constants";

type BucketCardProps = {
  bucket: AdminBucket;
};

export function BucketCard({ bucket }: BucketCardProps) {
  const colors = TIER_COLORS[bucket.tier];
  const sortedPlayers = [...bucket.players].sort((a, b) => b.weeklyTrophies - a.weeklyTrophies);
  const isFull = bucket.status === "full";

  return (
    <motion.div
      whileHover={{ scale: 1.02, rotate: 0.5 }}
      whileTap={{ scale: 0.98 }}
      className="rounded-xl border-3 border-black bg-white p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all"
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

