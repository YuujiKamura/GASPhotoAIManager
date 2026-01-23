import { useState, useCallback } from 'react';

/**
 * ステップの状態
 */
export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

/**
 * ステップの設定（初期化用）
 */
export interface StepConfig<T extends string = string> {
  id: T;
  name: string;
}

/**
 * ステップの状態（実行時）
 */
export interface Step<T extends string = string> {
  id: T;
  name: string;
  status: StepStatus;
  result?: string;
  progress?: number;
  subProgress?: string;
}

/**
 * useStepProgressの戻り値
 */
export interface UseStepProgressReturn<T extends string> {
  steps: Step<T>[];
  startStep: (id: T) => void;
  completeStep: (id: T, result?: string) => void;
  updateProgress: (id: T, progress: number, subProgress?: string) => void;
  skipStep: (id: T) => void;
  errorStep: (id: T, result?: string) => void;
  resetSteps: () => void;
  getStep: (id: T) => Step<T> | undefined;
  isAllDone: boolean;
  currentStep: Step<T> | undefined;
}

/**
 * 汎用ステップ進捗管理フック
 *
 * 任意のステップIDとステップ名で初期化し、進捗を管理する。
 * pause/resume機能は含まない（バッチ解析用のラッパーで追加）
 *
 * @example
 * const STEPS = [
 *   { id: 'read', name: '画像読込' },
 *   { id: 'ocr', name: '黒板読取' },
 * ] as const;
 * type StepId = typeof STEPS[number]['id'];
 *
 * const { steps, startStep, completeStep } = useStepProgress<StepId>(STEPS);
 */
export function useStepProgress<T extends string>(
  initialSteps: readonly StepConfig<T>[] | StepConfig<T>[]
): UseStepProgressReturn<T> {
  // 初期ステップを作成
  const createInitialSteps = useCallback((): Step<T>[] => {
    return initialSteps.map(config => ({
      id: config.id,
      name: config.name,
      status: 'pending' as StepStatus,
    }));
  }, [initialSteps]);

  const [steps, setSteps] = useState<Step<T>[]>(createInitialSteps);

  // ステップを開始状態にする
  const startStep = useCallback((id: T) => {
    setSteps(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'running' as StepStatus } : s
    ));
  }, []);

  // ステップを完了状態にする
  const completeStep = useCallback((id: T, result?: string) => {
    setSteps(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'done' as StepStatus, result } : s
    ));
  }, []);

  // ステップの進捗を更新する
  const updateProgress = useCallback((id: T, progress: number, subProgress?: string) => {
    setSteps(prev => prev.map(s =>
      s.id === id ? { ...s, progress, subProgress } : s
    ));
  }, []);

  // ステップをスキップ状態にする
  const skipStep = useCallback((id: T) => {
    setSteps(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'skipped' as StepStatus } : s
    ));
  }, []);

  // ステップをエラー状態にする
  const errorStep = useCallback((id: T, result?: string) => {
    setSteps(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'error' as StepStatus, result } : s
    ));
  }, []);

  // ステップをリセットする
  const resetSteps = useCallback(() => {
    setSteps(createInitialSteps());
  }, [createInitialSteps]);

  // 特定のステップを取得
  const getStep = useCallback((id: T): Step<T> | undefined => {
    return steps.find(s => s.id === id);
  }, [steps]);

  // 全ステップが完了しているか
  const isAllDone = steps.every(s => s.status === 'done' || s.status === 'skipped');

  // 現在実行中のステップ
  const currentStep = steps.find(s => s.status === 'running');

  return {
    steps,
    startStep,
    completeStep,
    updateProgress,
    skipStep,
    errorStep,
    resetSteps,
    getStep,
    isAllDone,
    currentStep,
  };
}
