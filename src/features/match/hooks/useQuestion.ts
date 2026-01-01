"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { QuestionDocSchema } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import type { QuestionDoc } from "@/lib/validation/schemas";

/**
 * Real-time question subscription hook with Zod validation
 * 
 * Architecture Decision:
 * - Firestore'dan gelen question data'yı Zod ile validate ediyoruz
 * - Invalid data gelirse null döner (app crash olmaz)
 * - Type-safe QuestionDoc döner
 */
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
        if (!snap.exists()) {
          setQuestion(null);
          setLoading(false);
          return;
        }

        // Zod validation ile safe parse
        const rawData = snap.data();
        const validated = safeParse(QuestionDocSchema, rawData, `useQuestion:${questionId}`);
        setQuestion(validated);
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
