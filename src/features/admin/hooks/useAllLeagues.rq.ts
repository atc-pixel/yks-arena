/**
 * useAllLeagues Hook - Admin Panel için
 * 
 * Architecture Decision:
 * - Tüm league bucket'larını tier'a göre gruplandırılmış şekilde çeker
 * - Teneke kullanıcılarını users collection'ından çeker (bucket yok)
 * - Real-time subscription ile güncel tutar
 * - Sadece admin kullanımı için (performans için limit yok)
 */

"use client";

import { collection, query, onSnapshot, orderBy, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { LeagueBucketSchema, type LeagueTier } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import { useFirestoreQuery } from "@/lib/react-query/firestore-adapter";

const LEAGUES_COLLECTION = "leagues";
const USERS_COLLECTION = "users";

// Tier sıralama önceliği
const TIER_ORDER: LeagueTier[] = ["Diamond", "Platinum", "Gold", "Silver", "Bronze", "Teneke"];

// Bucket type - sadece display için gereken fieldlar
export type AdminBucket = {
  tier: LeagueTier;
  seasonId: string;
  bucketNumber: number;
  status: "active" | "full" | "archived";
  players: { uid: string; weeklyTrophies: number; totalTrophies: number }[];
};

export type GroupedLeagues = {
  tier: LeagueTier;
  buckets: AdminBucket[];
  totalPlayers: number;
}[];

// Teneke kullanıcısı tipi (bucket'sız)
export type TenekeUser = {
  uid: string;
  displayName: string;
  trophies: number;
  weeklyTrophies: number;
};

export function useAllLeagues() {
  const { data, loading, error } = useFirestoreQuery<GroupedLeagues>(
    ["allLeagues"],
    (onNext) => {
      const ref = collection(db, LEAGUES_COLLECTION);
      const q = query(ref, orderBy("tier"), orderBy("bucketNumber"));

      const unsubscribe = onSnapshot(
        q,
        (snap) => {
          const buckets: AdminBucket[] = [];

          snap.docs.forEach((docSnap) => {
            const rawData = docSnap.data();
            const validated = safeParse(LeagueBucketSchema, rawData, `useAllLeagues:${docSnap.id}`);
            if (validated) {
              // Map to AdminBucket (drop Timestamp fields for display)
              buckets.push({
                tier: validated.tier,
                seasonId: validated.seasonId,
                bucketNumber: validated.bucketNumber,
                status: validated.status,
                players: validated.players.map(p => ({
                  uid: p.uid,
                  weeklyTrophies: p.weeklyTrophies,
                  totalTrophies: p.totalTrophies,
                })),
              });
            }
          });

          // Tier'a göre grupla
          const grouped = groupByTier(buckets);
          onNext(grouped);
        },
        (err) => {
          console.error("useAllLeagues snapshot error:", err);
          onNext([]);
        }
      );

      return unsubscribe;
    }
  );

  return { leagues: data ?? [], loading, error };
}

/**
 * Teneke kullanıcılarını users collection'ından çeker
 * Teneke için bucket olmadığından ayrı sorgu gerekiyor
 */
export function useTenekeUsers() {
  const { data, loading, error } = useFirestoreQuery<TenekeUser[]>(
    ["tenekeUsers"],
    (onNext) => {
      const ref = collection(db, USERS_COLLECTION);
      const q = query(
        ref,
        where("league.currentLeague", "==", "Teneke"),
        limit(100) // Admin görünümü için yeterli
      );

      const unsubscribe = onSnapshot(
        q,
        (snap) => {
          const users: TenekeUser[] = [];

          snap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            users.push({
              uid: docSnap.id,
              displayName: data.displayName || `User ${docSnap.id.slice(0, 6)}`,
              trophies: data.trophies ?? 0,
              weeklyTrophies: data.league?.weeklyTrophies ?? 0,
            });
          });

          // weeklyTrophies'e göre sırala
          users.sort((a, b) => b.weeklyTrophies - a.weeklyTrophies);
          onNext(users);
        },
        (err) => {
          console.error("useTenekeUsers snapshot error:", err);
          onNext([]);
        }
      );

      return unsubscribe;
    }
  );

  return { tenekeUsers: data ?? [], loading, error };
}

function groupByTier(buckets: AdminBucket[]): GroupedLeagues {
  const groups: Record<LeagueTier, AdminBucket[]> = {
    Diamond: [],
    Platinum: [],
    Gold: [],
    Silver: [],
    Bronze: [],
    Teneke: [],
  };

  buckets.forEach((bucket) => {
    groups[bucket.tier].push(bucket);
  });

  // Sıralı array'e çevir, boş tier'ları da dahil et
  return TIER_ORDER.map((tier) => ({
    tier,
    buckets: groups[tier],
    totalPlayers: groups[tier].reduce((sum, b) => sum + b.players.length, 0),
  }));
}

