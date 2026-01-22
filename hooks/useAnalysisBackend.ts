import { useState } from 'react';
import { AnalysisBackend, getAnalysisBackend, setAnalysisBackend, clearAnalysisBackend } from '../services/analysisBackend';

export function useAnalysisBackend() {
  const [backend, setBackendState] = useState<AnalysisBackend | null>(() => getAnalysisBackend());

  const setBackend = (value: AnalysisBackend) => {
    setAnalysisBackend(value);
    setBackendState(value);
  };

  const resetBackend = () => {
    clearAnalysisBackend();
    setBackendState(null);
  };

  return { backend, setBackend, resetBackend };
}
