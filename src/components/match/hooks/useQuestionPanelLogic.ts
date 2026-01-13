/**
 * QuestionPanel Logic Hook
 * 
 * Architecture Decision:
 * - QuestionPanel component'inden tüm logic'i buraya taşıdık
 * - Reveal state, lastResult handling, submit logic burada
 * - Sound ve haptic logic useQuestionResultFeedback hook'unda (separation of concerns)
 * - Component sadece UI render eder
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuestionResultFeedback } from "./useQuestionResultFeedback";
import type { ChoiceKey, SymbolKey } from "@/lib/validation/schemas";

export type MatchLastResult = {
  uid: string;
  questionId: string;
  symbol: SymbolKey;
  answer: ChoiceKey;
  correctAnswer: ChoiceKey;
  isCorrect: boolean;
  earnedSymbol: SymbolKey | null;
  at: number;
  questionIndex?: 0 | 1 | 2;
};

type RevealState = {
  correctKey: ChoiceKey;
  wrongKey: ChoiceKey | null;
  isCorrect: boolean;
};

type UseQuestionPanelLogicParams = {
  canAnswer: boolean;
  busy: boolean;
  myUid: string | null;
  activeQuestionId: string | null;
  lastResult: MatchLastResult | null;
  canContinue: boolean;
  onSubmit: (answer: ChoiceKey) => Promise<void>;
};

export function useQuestionPanelLogic({
  canAnswer,
  busy,
  myUid,
  activeQuestionId,
  lastResult,
  canContinue,
  onSubmit,
}: UseQuestionPanelLogicParams) {
  // Sound ve haptic feedback ayrı hook'ta
  useQuestionResultFeedback({
    lastResult: lastResult
      ? {
          questionId: lastResult.questionId,
          at: lastResult.at,
          isCorrect: lastResult.isCorrect,
          uid: lastResult.uid,
        }
      : null,
    myUid,
    activeQuestionId,
    canContinue,
  });

  const [selectedKey, setSelectedKey] = useState<ChoiceKey | null>(null);
  const [processingKey, setProcessingKey] = useState<ChoiceKey | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);

  // Prevent double submissions (even if parent busy lags)
  const submittingRef = useRef(false);
  const playedResultRef = useRef<string | null>(null);

  // Reset local UI when question changes
  useEffect(() => {
    setSelectedKey(null);
    setProcessingKey(null);
    setReveal(null);
    submittingRef.current = false;
    playedResultRef.current = null;
  }, [activeQuestionId]);

  const resultForThisQuestion = useMemo(() => {
    if (!lastResult || !myUid || !activeQuestionId) return null;
    if (lastResult.uid !== myUid) return null;
    if (lastResult.questionId !== activeQuestionId) return null;
    return lastResult;
  }, [lastResult, myUid, activeQuestionId]);

  // Q1 doğru cevaplandıysa ve sonraki soru hazırsa buton göster
  const shouldShowContinueButton = useMemo(() => {
    if (!lastResult || !myUid || !activeQuestionId) return false;
    if (lastResult.uid !== myUid) return false;
    if (lastResult.questionId !== activeQuestionId) return false;
    // Q1 doğru cevaplandıysa (questionIndex 1 ve isCorrect true)
    return lastResult.isCorrect && (lastResult.questionIndex === 1 || (lastResult.questionIndex === undefined && !canContinue));
  }, [lastResult, myUid, activeQuestionId, canContinue]);

  // Stable key for lastResult to prevent infinite loops
  const lastResultKey = useMemo(() => {
    if (!lastResult || !myUid || !activeQuestionId) return null;
    if (lastResult.uid !== myUid || lastResult.questionId !== activeQuestionId) return null;
    return `${lastResult.questionId}:${lastResult.at}`;
  }, [lastResult?.questionId, lastResult?.at, lastResult?.uid, myUid, activeQuestionId]);

  // Stable lastResult data to prevent infinite loops (only extract needed fields)
  const lastResultData = useMemo(() => {
    if (!lastResult || !myUid || !activeQuestionId) return null;
    if (lastResult.uid !== myUid || lastResult.questionId !== activeQuestionId) return null;
    return {
      isCorrect: lastResult.isCorrect,
      correctAnswer: lastResult.correctAnswer,
      answer: lastResult.answer,
    };
  }, [lastResult?.isCorrect, lastResult?.correctAnswer, lastResult?.answer, myUid, activeQuestionId]);

  // When Firestore result arrives, reveal colors (sound/haptic useQuestionResultFeedback'te)
  useEffect(() => {
    // RESULT phase'inde ve lastResult varsa, reveal set et
    if (canContinue && lastResultKey && lastResultData) {
      // Sadece daha önce işlenmemişse state update yap
      if (playedResultRef.current !== lastResultKey) {
        // State update'leri sadece bir kez yap
        setProcessingKey(null);
        setReveal({
          correctKey: lastResultData.correctAnswer,
          wrongKey: lastResultData.isCorrect ? null : lastResultData.answer,
          isCorrect: lastResultData.isCorrect,
        });
        submittingRef.current = false;

        // Ref'i güncelle (bu state update'i tetiklemez)
        playedResultRef.current = lastResultKey;
      }
      return;
    }

    if (!resultForThisQuestion) return;

    const key = `${resultForThisQuestion.questionId}:${resultForThisQuestion.at}`;
    // Sadece daha önce işlenmemişse state update yap
    if (playedResultRef.current === key) return;

    // Ref'i önce güncelle (state update'ten önce)
    playedResultRef.current = key;

    // State update'leri (sound/haptic useQuestionResultFeedback'te)
    setProcessingKey(null);
    setReveal({
      correctKey: resultForThisQuestion.correctAnswer,
      wrongKey: resultForThisQuestion.isCorrect ? null : resultForThisQuestion.answer,
      isCorrect: resultForThisQuestion.isCorrect,
    });

    // keep buttons locked for a beat to let the animation land
    const t = setTimeout(() => {
      // Parent will move phase forward; we just release local submit lock
      submittingRef.current = false;
    }, 1500);

    return () => clearTimeout(t);
  }, [resultForThisQuestion, canContinue, lastResultKey, lastResultData]);

  const locked = !canAnswer || busy || !!processingKey || !!reveal || submittingRef.current;

  const onPick = async (k: ChoiceKey) => {
    if (locked) return;
    if (!activeQuestionId) return;

    setSelectedKey(k);
    setProcessingKey(k);
    submittingRef.current = true;

    try {
      await onSubmit(k);
      // Firestore lastResult will drive the reveal state.
      // keep processingKey until result arrives or parent changes phase.
    } catch {
      // If submit fails, unlock and remove processing state
      submittingRef.current = false;
      setProcessingKey(null);
    }
  };

  return {
    selectedKey,
    processingKey,
    reveal,
    locked,
    onPick,
    shouldShowContinueButton,
  };
}

