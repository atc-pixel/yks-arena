/**
 * CategorySelector Component
 * 
 * Architecture Decision:
 * - 4 kategori seçimi için kullanılır (BILIM, COGRAFYA, SPOR, MATEMATIK)
 * - Home page'de queue'ya girmeden önce kategori seçilir
 * - Pop-art style: bold borders, vibrant colors, hard shadows
 */

"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import type { Category } from "@/lib/validation/schemas";

type Props = {
  selectedCategory: Category | null;
  onSelectCategory: (category: Category) => void;
  disabled?: boolean;
};

const CATEGORIES: Category[] = ["BILIM", "COGRAFYA", "SPOR", "MATEMATIK"];

const CATEGORY_LABELS: Record<Category, string> = {
  BILIM: "Bilim",
  COGRAFYA: "Coğrafya",
  SPOR: "Spor",
  MATEMATIK: "Matematik",
};

const CATEGORY_COLORS: Record<Category, string> = {
  BILIM: "bg-cyan-400 hover:bg-cyan-300",
  COGRAFYA: "bg-green-400 hover:bg-green-300",
  SPOR: "bg-orange-400 hover:bg-orange-300",
  MATEMATIK: "bg-purple-400 hover:bg-purple-300",
};

export function CategorySelector({ selectedCategory, onSelectCategory, disabled }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border-4 border-black bg-gradient-to-br from-pink-400 via-purple-400 to-indigo-500 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
    >
      <div className="mb-4">
        <h2 className="text-xl font-black uppercase tracking-wide text-black drop-shadow-[2px_2px_0px_rgba(255,255,255,0.8)]">
          Kategori Seç
        </h2>
        <p className="mt-2 text-sm font-bold text-black/80">
          Hangi kategoride yarışmak istiyorsun?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map((category) => {
          const isSelected = selectedCategory === category;
          const colorClass = CATEGORY_COLORS[category];

          return (
            <motion.button
              key={category}
              onClick={() => !disabled && onSelectCategory(category)}
              disabled={disabled}
              whileHover={!disabled ? { scale: 1.05, y: -2 } : {}}
              whileTap={!disabled ? { scale: 0.95 } : {}}
              animate={
                isSelected && !disabled
                  ? {
                      boxShadow: [
                        "6px_6px_0px_0px_rgba(0,0,0,1)",
                        "4px_4px_0px_0px_rgba(0,0,0,1)",
                        "6px_6px_0px_0px_rgba(0,0,0,1)",
                      ],
                    }
                  : {}
              }
              transition={
                isSelected && !disabled
                  ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" }
                  : undefined
              }
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-2xl border-4 border-black px-4 py-4 text-sm font-black uppercase tracking-wide shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
                isSelected && !disabled
                  ? `${colorClass} text-black`
                  : disabled
                    ? "bg-neutral-300 text-neutral-600"
                    : "bg-white text-black hover:bg-neutral-100",
                "disabled:cursor-not-allowed transition-all"
              )}
            >
              <span>{CATEGORY_LABELS[category]}</span>
              {isSelected && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-xs"
                >
                  ✓
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.section>
  );
}
