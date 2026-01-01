export type Category = "MAT" | "TURKCE" | "FEN" | "SOSYAL";
export type ChoiceKey = "A" | "B" | "C" | "D" | "E";

export type Question = {
  id: string;
  category: Category;
  topic?: string | null;
  questionNumber?: string | null;
  question: string;
  choices: Record<ChoiceKey, string>;
  answer: ChoiceKey;
  explanation?: string | null;
  difficulty?: number | null;
  isActive?: boolean;
};

export type MatchStatus = "WAITING" | "ACTIVE" | "FINISHED" | "CANCELLED";

export type SymbolKey = "BILIM" | "COGRAFYA" | "SPOR" | "MATEMATIK";
export const ALL_SYMBOLS: SymbolKey[] = ["BILIM", "COGRAFYA", "SPOR", "MATEMATIK"];

export type PlayerState = {
  trophies: number;       // match içinde biriken kupa
  symbols: SymbolKey[];   // kazanılan semboller
  wrongCount: number;     // perfect run için
  answeredCount: number;  // perfect run için
};

export type TurnPhase = "SPIN" | "QUESTION" | "RESULT" | "END";

// DEPRECATED: Bu type artık kullanılmıyor, @/lib/validation/schemas'dan MatchDoc import edin
// Backward compatibility için tutuluyor, yeni kod için schemas.ts kullanın
import type { Timestamp } from "firebase/firestore";

export type MatchDoc = {
  createdAt: Timestamp;
  status: MatchStatus;
  mode: "RANDOM" | "INVITE";
  players: string[]; // [uid1, uid2]

  turn: {
  currentUid: string;
  phase: TurnPhase;
  challengeSymbol: SymbolKey | null;
  streak: number; // 0|1 kilitliyse sembol kazanımı için engel olur, number yapıyoruz
  activeQuestionId: string | null;
  usedQuestionIds: string[];
  lastResult?: TurnLastResult | null;
  streakSymbol?: SymbolKey | null;
  questionIndex?: 0 | 1 | 2;
};

  stateByUid: Record<string, PlayerState>;
  winnerUid?: string;
  endedReason?: string;
};

export type TurnLastResult = {
  uid: string;
  questionId: string;
  symbol: SymbolKey;
  answer: ChoiceKey;
  correctAnswer: ChoiceKey;
  isCorrect: boolean;
  kupaAwarded?: number;
  earnedSymbol: SymbolKey | null;
  at: number;
  questionIndex?: 0 | 1 | 2;
  
};

