"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Trophy, User as UserIcon, Zap } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { UserDoc } from "@/lib/validation/schemas";

type Props = {
  children: React.ReactNode;
  user: UserDoc | null;
  userLoading: boolean;
  userError?: string | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const a = parts[0]?.[0] ?? "G";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

export function AppLayout({ children, user, userLoading, userError }: Props) {
  const pathname = usePathname();

  const energy = user?.economy?.energy ?? 0;
  const [prevEnergy, setPrevEnergy] = useState<number>(energy);
  const energyChanged = prevEnergy !== energy;
  useEffect(() => {
    setPrevEnergy(energy);
  }, [energy]);

  const navItems = useMemo(
    () => [
      { href: "/", label: "Arena", icon: Home },
      { href: "/leaderboard", label: "Liderlik", icon: Trophy },
      { href: "/profile", label: "Profil", icon: UserIcon },
    ],
    []
  );

  const activeHref =
    navItems.find((n) => (n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href)))?.href ?? "/";

  return (
    <div className="min-h-dvh bg-linear-to-b from-indigo-950 via-purple-950 to-pink-950 text-neutral-100">
      {/* Centered App Container */}
      <div className="mx-auto w-full max-w-lg px-4 pb-28 pt-4">
        {/* Top Bar */}
        <div className="sticky top-0 z-30 -mx-4 px-4 pt-2">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="rounded-3xl border-4 border-black bg-linear-to-r from-cyan-400 via-pink-400 to-yellow-400 p-1 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
          >
            <div className="rounded-2xl bg-white/95 p-3 backdrop-blur-sm">
              <div className="flex items-center justify-between px-2 py-2">
                {/* Left: Avatar + Level */}
                <div className="flex items-center gap-3">
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    className="relative h-12 w-12 overflow-hidden rounded-xl border-4 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                  >
                    {user?.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.photoURL} alt="avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-linear-to-br from-purple-400 to-pink-400 text-sm font-black text-black">
                        {user ? initials(user.displayName) : "…"}
                      </div>
                    )}
                  </motion.div>

                  <div className="leading-tight">
                    <div className="text-sm font-black text-black">
                      {userLoading ? "Yükleniyor…" : user?.displayName ?? "Misafir"}
                    </div>
                    <div className="mt-1 inline-flex items-center gap-2 text-xs">
                      <span className="rounded-lg border-2 border-black bg-yellow-400 px-2 py-0.5 font-black text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        Lv {user?.level ?? 1}
                      </span>
                      <span className="font-bold text-black/70">{user?.league?.currentLeague ?? "BRONZE"}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Energy Pill */}
                <motion.div
                  key={energy} // enerji değişince küçük animasyon
                  initial={energyChanged ? { scale: 0.8, rotate: -10 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl border-4 border-black bg-linear-to-br from-lime-400 to-green-500 px-4 py-2 text-sm font-black text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                  )}
                >
                  <Zap className="h-5 w-5" />
                  <span className="tabular-nums">{energy}</span>
                </motion.div>
              </div>

              <AnimatePresence>
                {userError && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mx-2 mb-2 rounded-lg border-2 border-black bg-red-400 px-3 py-2 text-xs font-bold text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                  >
                    {userError}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* Page Content */}
        <main className="mt-4">{children}</main>
      </div>

      {/* Floating Dock */}
      <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="w-full max-w-lg">
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mx-auto w-full rounded-3xl border-4 border-black bg-white p-2 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
          >
            <div className="relative grid grid-cols-3 gap-2">
              {/* active background */}
              <motion.div
                layoutId="dock-active"
                className="absolute inset-y-0 rounded-xl border-4 border-black bg-linear-to-br from-cyan-400 to-pink-400 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                style={{
                  width: "calc((100% - 16px) / 3)", // 2*gap(8px)=16px
                  left:
                    activeHref === navItems[0].href
                      ? 0
                      : activeHref === navItems[1].href
                        ? "calc((100% - 16px) / 3 + 8px)"
                        : "calc(2 * ((100% - 16px) / 3 + 8px))",
                }}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />

              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeHref === item.href;
                return (
                  <motion.div
                    key={item.href}
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    className="relative z-10"
                  >
                    <Link
                      href={item.href}
                      className={cn(
                        "flex h-12 items-center justify-center gap-2 rounded-xl",
                        "text-sm font-black uppercase tracking-wide transition-all",
                        isActive ? "text-black" : "text-black/60"
                      )}
                    >
                      <Icon className={cn("h-5 w-5", isActive ? "text-black" : "text-black/60")} />
                      <span className="hidden sm:inline">{item.label}</span>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
