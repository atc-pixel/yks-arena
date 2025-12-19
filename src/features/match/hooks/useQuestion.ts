"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type QuestionDoc = {
  category: string;
  question: string;
  choices: Record<"A" | "B" | "C" | "D" | "E", string>;
  answer: "A" | "B" | "C" | "D" | "E";
  isActive?: boolean;
  randomHash?: string;
};

export function useQuestion(questionId: string | null | undefined) {
  const [question, setQuestion] = useState<QuestionDoc | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!questionId) {
      setQuestion(null);
      return;
    }

    setLoading(true);
    const ref = doc(db, "questions", questionId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setQuestion((snap.exists() ? (snap.data() as any) : null) as QuestionDoc | null);
        setLoading(false);
      },
      (err) => {
        console.error("useQuestion snapshot error:", err);
        setQuestion(null);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [questionId]);

  return { question, loading };
}
