"use client";

/**
 * App Providers
 * 
 * Architecture Decision:
 * - React Query Provider'ı burada wrap ediyoruz
 * - Root layout'ta kullanılacak
 * - Client component olmalı (React Query client-side only)
 * - Global click sound handler burada
 */

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/react-query/config";
import { useSound } from "@/hooks/useSound";

function GlobalClickSound() {
  const { playClick } = useSound();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Button, link, veya clickable element'lere tıklandığında sound çal
      if (
        target.tagName === "BUTTON" ||
        target.tagName === "A" ||
        target.closest("button") ||
        target.closest("a") ||
        target.getAttribute("role") === "button" ||
        target.onclick !== null
      ) {
        playClick();
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [playClick]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalClickSound />
      {children}
    </QueryClientProvider>
  );
}

