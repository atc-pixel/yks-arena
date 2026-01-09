"use client";

import { motion } from "framer-motion";
import type { TenekeUser } from "@/features/admin/hooks/useAllLeagues.rq";

type TenekeUsersListProps = {
  users: TenekeUser[];
};

/** Teneke kullanıcı listesi - bucket yok, direkt users collection'dan */
export function TenekeUsersList({ users }: TenekeUsersListProps) {
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

