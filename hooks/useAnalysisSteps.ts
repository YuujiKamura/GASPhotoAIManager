import { useState, useCallback, useRef } from 'react';
import type { AnalysisStep, AnalysisStepId, AnalysisMode, AnalysisPauseState } from '../types';

const INITIAL_STEPS: AnalysisStep[] = [
  { id: 'prepare', name: '画像準備', status: 'pending' },
  { id: 'detect', name: '黒板判定', status: 'pending' },
  { id: 'analyze', name: 'AI解析', status: 'pending' },
  { id: 'normalize', name: '正規化', status: 'pending' },
];

const INITIAL_PAUSE_STATE: AnalysisPauseState = {
  isPaused: false,
  canResume: false,
};

export function useAnalysisSteps() {
  const [steps, setSteps] = useState<AnalysisStep[]>(INITIAL_STEPS);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('auto');
  const [pauseState, setPauseState] = useState<AnalysisPauseState>(INITIAL_PAUSE_STATE);

  // 再開用のPromise resolve関数を保持
  const resumeResolverRef = useRef<(() => void) | null>(null);

  const startStep = useCallback((id: AnalysisStepId) => {
    setSteps(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'running' } : s
    ));
  }, []);

  const completeStep = useCallback((id: AnalysisStepId, result?: string) => {
    setSteps(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'done', result } : s
    ));
  }, []);

  const updateProgress = useCallback((id: AnalysisStepId, progress: number, subProgress?: string) => {
    setSteps(prev => prev.map(s =>
      s.id === id ? { ...s, progress, subProgress } : s
    ));
  }, []);

  const skipStep = useCallback((id: AnalysisStepId) => {
    setSteps(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'skipped' } : s
    ));
  }, []);

  const errorStep = useCallback((id: AnalysisStepId, result?: string) => {
    setSteps(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'error', result } : s
    ));
  }, []);

  const resetSteps = useCallback(() => {
    setSteps(INITIAL_STEPS.map(s => ({ ...s })));
    setPauseState(INITIAL_PAUSE_STATE);
    resumeResolverRef.current = null;
  }, []);

  // 一時停止をリクエスト（ユーザーがボタンを押した時）
  const requestPause = useCallback(() => {
    // 現在実行中のステップを探す
    setSteps(prev => {
      const runningStep = prev.find(s => s.status === 'running');
      if (runningStep) {
        setPauseState({
          isPaused: true,
          pausedAtStep: runningStep.id,
          pauseReason: 'user',
          canResume: true,
        });
      }
      return prev;
    });
  }, []);

  // パイプラインから呼ばれる: 一時停止が必要かチェックし、必要なら待機
  const checkPausePoint = useCallback(async (stepId: AnalysisStepId): Promise<boolean> => {
    // autoモードでは常にfalse（停止しない）
    if (analysisMode === 'auto') {
      return false;
    }

    // interactiveモードで一時停止がリクエストされている場合
    return new Promise<boolean>((resolve) => {
      setPauseState(prev => {
        if (prev.isPaused && prev.pausedAtStep === stepId) {
          // 再開を待つ
          resumeResolverRef.current = () => resolve(false);
          return prev;
        }
        resolve(false);
        return prev;
      });
    });
  }, [analysisMode]);

  // 解析を再開
  const resumeAnalysis = useCallback(() => {
    if (resumeResolverRef.current) {
      resumeResolverRef.current();
      resumeResolverRef.current = null;
    }
    setPauseState({
      isPaused: false,
      canResume: false,
    });
  }, []);

  // モードを切り替え
  const toggleMode = useCallback(() => {
    setAnalysisMode(prev => prev === 'auto' ? 'interactive' : 'auto');
  }, []);

  return {
    // ステップ状態
    steps,
    startStep,
    completeStep,
    updateProgress,
    skipStep,
    errorStep,
    resetSteps,
    // 一時停止/再開
    analysisMode,
    setAnalysisMode,
    toggleMode,
    pauseState,
    requestPause,
    checkPausePoint,
    resumeAnalysis,
  };
}
