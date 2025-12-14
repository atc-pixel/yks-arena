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

export type SymbolKey = "TR1" | "TR2" | "TR3" | "TR4";

export type PlayerState = {
  lives: number;          // 5
  points: number;         // MVP: 0 başla
  symbols: SymbolKey[];   // kazanılan semboller
  wrongCount: number;     // perfect run için
  answeredCount: number;  // perfect run için
};

export type TurnPhase = "SPIN" | "QUESTION";

export type MatchDoc = {
  createdAt: any;
  status: MatchStatus;
  mode: "RANDOM" | "INVITE";
  players: string[]; // [uid1, uid2]

  turn: {
    currentUid: string;
    phase: TurnPhase;
    challengeSymbol: SymbolKey | null;
    streak: 0 | 1; // aynı sembolde ardışık doğru
    activeQuestionId: string | null;
    usedQuestionIds: string[];
  };

  stateByUid: Record<string, PlayerState>;

  winnerUid?: string;
  endedReason?: string;
};
