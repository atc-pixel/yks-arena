/**
 * useQuestion Hook (React Query Version)
 * 
 * Architecture Decision:
 * - Question data React Query cache'inde tutulur
 * - Aynı questionId için birden fazla component kullanırsa, tek subscription yeterli
 */

"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { QuestionDocSchema } from "@/lib/validation/schemas";
import { safeParse } from "@/lib/validation/utils";
import { useFirestoreQuery } from "@/lib/react-query/firestore-adapter";
import type { QuestionDoc } from "@/lib/validation/schemas";

export function useQuestion(questionId: string | null | undefined) {
  const { data, loading, error } = useFirestoreQuery<QuestionDoc>(
    questionId ? ["question", questionId] : ["question", "null"],
    (onNext) => {
      if (!questionId) {
        onNext(null);
        return () => {}; // No-op unsubscribe
      }

      const ref = doc(db, "questions", questionId);
      const unsubscribe = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            onNext(null);
            return;
          }

          const rawData = snap.data();
          const validated = safeParse(QuestionDocSchema, rawData, `useQuestion:${questionId}`);
          onNext(validated);
        },
        (err) => {
          console.error("useQuestion snapshot error:", err);
          onNext(null);
        }
      );

      return unsubscribe;
    }
  );

  // Backward compatibility: return question instead of data
  return { question: data, loading, error };
}

