"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useAnonAuth } from "@/features/auth/useAnonAuth";
import { useUser } from "@/features/users/hooks/useUser";

/**
 * Profile Page - Placeholder
 * 
 * TODO: User profile görüntüleme ve düzenleme eklenebilir
 */
export default function ProfilePage() {
  const { user: authUser } = useAnonAuth();
  const uid = authUser?.uid ?? null;
  const { user, loading } = useUser(uid);

  return (
    <AppLayout user={user} userLoading={loading} userError={null}>
      <div className="rounded-3xl border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <h1 className="mb-4 text-2xl font-black text-black">Profil</h1>
        
        {loading ? (
          <div className="text-black/60">Yükleniyor...</div>
        ) : user ? (
          <div className="space-y-4 text-black">
            <div>
              <div className="text-sm font-bold text-black/60">İsim</div>
              <div className="text-lg font-black">{user.displayName}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-black/60">Seviye</div>
              <div className="text-lg font-black">Lv {user.level}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-black/60">Lig</div>
              <div className="text-lg font-black">{user.league?.currentLeague ?? "Teneke"}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-black/60">Toplam Kupa</div>
              <div className="text-lg font-black">{user.trophies ?? 0}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-black/60">Toplam Maç</div>
              <div className="text-lg font-black">{user.stats?.totalMatches ?? 0}</div>
            </div>
            <div>
              <div className="text-sm font-bold text-black/60">Kazanma</div>
              <div className="text-lg font-black">{user.stats?.totalWins ?? 0}</div>
            </div>
          </div>
        ) : (
          <div className="text-black/60">Profil bulunamadı.</div>
        )}
      </div>
    </AppLayout>
  );
}
