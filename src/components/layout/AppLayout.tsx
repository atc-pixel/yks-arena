"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Trophy, User as UserIcon, Zap } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { User } from "@/features/users/hooks/useUser";

type Props = {
  children: React.ReactNode;
  user: User | null;
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
  const prevEnergyRef = useRef<number>(energy);

  const energyChanged = prevEnergyRef.current !== energy;
  useEffect(() => {
    prevEnergyRef.current = energy;
  }, [energy]);

  const navItems = useMemo(
    () => [
      { href: "/", label: "Arena", icon: Home },
      { href: "/leaderboard", label: "Lider", icon: Trophy },
      { href: "/profile", label: "Profil", icon: UserIcon },
    ],
    []
  );

  const activeHref =
    navItems.find((n) => (n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href)))?.href ?? "/";

  return (
    <div className="min-h-dvh bg-linear-to-b from-neutral-950 via-neutral-950 to-neutral-900 text-neutral-100">
      {/* Centered App Container */}
      <div className="mx-auto w-full max-w-lg px-4 pb-28 pt-4">
        {/* Top Bar */}
        <div className="sticky top-0 z-30 -mx-4 px-4 pt-2">
          <div className="rounded-3xl bg-neutral-950/70 ring-1 ring-neutral-800 backdrop-blur">
            <div className="flex items-center justify-between px-4 py-3">
              {/* Left: Avatar + Level */}
              <div className="flex items-center gap-3">
                <div className="relative h-11 w-11 overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-neutral-800">
                  {user?.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.photoURL} alt="avatar" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-sm font-bold text-neutral-200">
                      {user ? initials(user.displayName) : "…"}
                    </div>
                  )}
                </div>

                <div className="leading-tight">
                  <div className="text-sm font-semibold">
                    {userLoading ? "Yükleniyor…" : user?.displayName ?? "Misafir"}
                  </div>
                  <div className="mt-0.5 inline-flex items-center gap-2 text-xs text-neutral-300">
                    <span className="rounded-full bg-neutral-900 px-2 py-0.5 ring-1 ring-neutral-800">
                      Lv {user?.level ?? 1}
                    </span>
                    <span className="text-neutral-500">{user?.league?.currentLeague ?? "BRONZE"}</span>
                  </div>
                </div>
              </div>

              {/* Right: Energy Pill */}
              <motion.div
                key={energy} // enerji değişince küçük animasyon
                initial={energyChanged ? { scale: 0.92 } : false}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold",
                  "bg-neutral-900 ring-1 ring-neutral-800"
                )}
              >
                <Zap className="h-4 w-4 text-emerald-400" />
                <span className="tabular-nums">{energy}</span>
              </motion.div>
            </div>

            <AnimatePresence>
              {userError && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 pb-3 text-xs text-red-200"
                >
                  {userError}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Page Content */}
        <main className="mt-4">{children}</main>
      </div>

      {/* Floating Dock */}
      <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="w-full max-w-lg">
          <div className="mx-auto w-full rounded-3xl bg-neutral-950/80 p-2 ring-1 ring-neutral-800 backdrop-blur">
            <div className="relative grid grid-cols-3 gap-2">
              {/* active background */}
              <motion.div
                layoutId="dock-active"
                className="absolute inset-y-0 rounded-2xl bg-neutral-900 ring-1 ring-neutral-800"
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
                  <motion.div key={item.href} whileTap={{ scale: 0.96 }} className="relative z-10">
                    <Link
                      href={item.href}
                      className={cn(
                        "flex h-12 items-center justify-center gap-2 rounded-2xl",
                        "text-sm font-semibold",
                        isActive ? "text-neutral-100" : "text-neutral-400"
                      )}
                    >
                      <Icon className={cn("h-5 w-5", isActive ? "text-neutral-100" : "text-neutral-400")} />
                      <span className="hidden sm:inline">{item.label}</span>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
