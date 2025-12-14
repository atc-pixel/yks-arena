// functions/src/shared/constants.ts

export const CHOICE_KEYS = ["A", "B", "C", "D", "E"] as const;
export type ChoiceKey = (typeof CHOICE_KEYS)[number];

export const ALL_SYMBOLS = ["TR1", "TR2", "TR3", "TR4"] as const;
export type SymbolKey = (typeof ALL_SYMBOLS)[number];

export const DEFAULT_LIVES = 5;

// You can expand these later when you add multi-subject wheels:
export const DEFAULT_CATEGORY = "TURKCE" as const;
export type CategoryKey = typeof DEFAULT_CATEGORY;
