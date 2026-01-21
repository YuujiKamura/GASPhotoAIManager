import { useState, useCallback } from 'react';
import type { AnalysisStep, AnalysisStepId } from '../types';

const INITIAL_STEPS: AnalysisStep[] = [
  { id: 'prepare', name: '画像準備', status: 'pending' },
  { id: 'detect', name: '黒板判定', status: 'pending' },
  { id: 'analyze', name: 'AI解析', status: 'pending' },
  { id: 'normalize', name: '正規化', status: 'pending' },
];

export function useAnalysisSteps() {
  const [steps, setSteps] = useState<AnalysisStep[]>(INITIAL_STEPS);

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
  }, []);

  return { steps, startStep, completeStep, updateProgress, skipStep, errorStep, resetSteps };
}
