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
    <span className="rounded-full bg-neutral-950/50 px-3 py-1 text-xs text-neutral-200 ring-1 ring-neutral-800">
      Kategori: <b>{category ? (SYMBOL_LABEL[category] ?? category) : "—"}</b>
    </span>
  );
}

