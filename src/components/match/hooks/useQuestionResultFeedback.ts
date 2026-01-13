/**
 * Question Result Feedback Hook
 * 
 * Architecture Decision:
 * - Sound ve haptic feedback logic'i burada
 * - Reusable hook - başka component'lerde de kullanılabilir
 * - QuestionPanelLogic'ten ayrıldı (separation of concerns)
 */

import { useEffect, useRef } from "react";
import { useSound } from "@/hooks/useSound";

type QuestionResult = {
  questionId: string;
  at: number;
  isCorrect: boolean;
  uid: string;
};

type UseQuestionResultFeedbackParams = {
  lastResult: QuestionResult | null;
  myUid: string | null;
  activeQuestionId: string | null;
  canContinue: boolean;
};

/**
 * Handles sound and haptic feedback for question results
 * 
 * Architecture Decision:
 * - Yanlış cevap: Hemen sound çal (activeQuestionId null olsa bile)
 * - Doğru cevap: RESULT phase'inde veya QUESTION phase'inde sound çal
 * - Her result için sadece bir kez sound çal (playedResultRef ile track edilir)
 */
export function useQuestionResultFeedback({
  lastResult,
  myUid,
  activeQuestionId,
  canContinue,
}: UseQuestionResultFeedbackParams) {
  const { playCorrect, playWrong } = useSound();
  const playedResultRef = useRef<string | null>(null);

  // Yanlış cevapta lastResult geldiğinde hemen sound çal (activeQuestionId null olsa bile)
  // Bu useEffect, yanlış cevapta phase SPIN'e geçtiği için activeQuestionId null olsa bile çalışır
  // Ama sadece yanlış cevap verildiğinde çalmalı, rakip çark çevirdiğinde değil
  useEffect(() => {
    if (!lastResult || !myUid) return;
    if (lastResult.uid !== myUid) return; // Sadece kendi cevabımız için
    if (lastResult.isCorrect) return; // Doğru cevap için başka useEffect var

    // Yanlış cevap - hemen sound çal
    // Ama sadece bu questionId için daha önce çalmadıysak
    const key = `${lastResult.questionId}:${lastResult.at}`;
    if (playedResultRef.current !== key) {
      playedResultRef.current = key;
      playWrong();
      try {
        navigator.vibrate?.([100, 50, 100]);
      } catch {
        // ignore
      }
    }
  }, [lastResult?.questionId, lastResult?.at, lastResult?.uid, lastResult?.isCorrect, myUid, playWrong]);

  // Doğru cevap için sound ve haptic
  // RESULT phase'inde (canContinue true) veya QUESTION phase'inde (activeQuestionId match ediyorsa)
  useEffect(() => {
    if (!lastResult || !myUid) return;
    if (lastResult.uid !== myUid) return;
    if (!lastResult.isCorrect) return; // Yanlış cevap için başka useEffect var

    const key = `${lastResult.questionId}:${lastResult.at}`;
    // Sadece daha önce çalmadıysak sound çal
    if (playedResultRef.current === key) return;

    // RESULT phase'inde (canContinue true) veya QUESTION phase'inde (activeQuestionId match ediyorsa)
    const isResultPhase = canContinue;
    const isQuestionPhase = activeQuestionId === lastResult.questionId;

    if (isResultPhase || isQuestionPhase) {
      playedResultRef.current = key;
      playCorrect();
      try {
        navigator.vibrate?.(200);
      } catch {
        // ignore
      }
    }
  }, [lastResult?.questionId, lastResult?.at, lastResult?.uid, lastResult?.isCorrect, myUid, activeQuestionId, canContinue, playCorrect]);

  // Reset playedResultRef when question changes
  useEffect(() => {
    playedResultRef.current = null;
  }, [activeQuestionId]);
}

