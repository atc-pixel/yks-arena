/**
 * Question Category Badge Component
 * 
 * Architecture Decision:
 * - Category badge ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

import type { SymbolKey } from "@/lib/validation/schemas";

const SYMBOL_LABEL: Partial<Record<SymbolKey, string>> = {
  MATEMATIK: "Matematik",
  COGRAFYA: "Coğrafya",
  SPOR: "Spor",
  BILIM: "Bilim",
};

type Props = {
  category: SymbolKey | null;
};

export function QuestionCategoryBadge({ category }: Props) {
  return (
    <span className="rounded-lg border-2 border-black bg-purple-400 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
      Kategori: <span className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.5)]">
        {category ? (SYMBOL_LABEL[category] ?? category) : "—"}
      </span>
    </span>
  );
}

