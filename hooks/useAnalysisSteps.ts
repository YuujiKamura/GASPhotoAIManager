import { useState, useCallback, useRef } from 'react';
import { useStepProgress, StepConfig } from './useStepProgress';
import type { AnalysisStepId, AnalysisMode, AnalysisPauseState } from '../types';

/**
 * バッチ解析用のステップ定義
 */
const BATCH_ANALYSIS_STEPS: StepConfig<AnalysisStepId>[] = [
  { id: 'prepare', name: '画像準備' },
  { id: 'detect', name: '黒板判定' },
  { id: 'analyze', name: 'AI解析' },
  { id: 'normalize', name: '正規化' },
];

const INITIAL_PAUSE_STATE: AnalysisPauseState = {
  isPaused: false,
  canResume: false,
};

/**
 * バッチ解析用のステップ管理フック
 *
 * 汎用のuseStepProgressをベースに、pause/resume機能を追加。
 */
export function useAnalysisSteps() {
  // 汎用ステップ進捗管理を使用
  const {
    steps,
    startStep,
    completeStep,
    updateProgress,
    skipStep,
    errorStep,
    resetSteps: resetBaseSteps,
  } = useStepProgress<AnalysisStepId>(BATCH_ANALYSIS_STEPS);

  // バッチ解析固有の状態
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('auto');
  const [pauseState, setPauseState] = useState<AnalysisPauseState>(INITIAL_PAUSE_STATE);

  // 再開用のPromise resolve関数を保持
  const resumeResolverRef = useRef<(() => void) | null>(null);

  // ステップをリセット（pause状態も含む）
  const resetSteps = useCallback(() => {
    resetBaseSteps();
    setPauseState(INITIAL_PAUSE_STATE);
    resumeResolverRef.current = null;
  }, [resetBaseSteps]);

  // 一時停止をリクエスト（ユーザーがボタンを押した時）
  const requestPause = useCallback(() => {
    // 現在実行中のステップを探す
    const runningStep = steps.find(s => s.status === 'running');
    if (runningStep) {
      setPauseState({
        isPaused: true,
        pausedAtStep: runningStep.id,
        pauseReason: 'user',
        canResume: true,
      });
    }
  }, [steps]);

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
