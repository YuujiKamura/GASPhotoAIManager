import { useState, useCallback } from 'react';
import { ProcessingStats, LogEntry } from '../types';

/**
 * 処理状態とログ管理のカスタムフック
 */
export function useProcessingState() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [stats, setStats] = useState<ProcessingStats>({
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    cached: 0
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAskingAI, setIsAskingAI] = useState(false);

  // ログ追加
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }].slice(-100));
    console.log(`[${type.toUpperCase()}] ${message}`);
  }, []);

  // ログクリア
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // エラーメッセージクリア（自動消去用）
  const showError = useCallback((message: string, duration = 5000) => {
    setErrorMsg(message);
    if (duration > 0) {
      setTimeout(() => setErrorMsg(null), duration);
    }
  }, []);

  // 成功メッセージ表示（自動消去用）
  const showSuccess = useCallback((message: string, duration = 3000) => {
    setSuccessMsg(message);
    if (duration > 0) {
      setTimeout(() => setSuccessMsg(null), duration);
    }
  }, []);

  // 統計リセット
  const resetStats = useCallback(() => {
    setStats({ total: 0, processed: 0, success: 0, failed: 0, cached: 0 });
  }, []);

  // 処理開始
  const startProcessing = useCallback((step?: string) => {
    setIsProcessing(true);
    if (step) setCurrentStep(step);
    setErrorMsg(null);
  }, []);

  // 処理終了
  const endProcessing = useCallback(() => {
    setIsProcessing(false);
    setCurrentStep("");
  }, []);

  return {
    // 状態
    isProcessing,
    setIsProcessing,
    currentStep,
    setCurrentStep,
    stats,
    setStats,
    errorMsg,
    setErrorMsg,
    successMsg,
    setSuccessMsg,
    logs,
    setLogs,
    isAskingAI,
    setIsAskingAI,

    // ユーティリティ
    addLog,
    clearLogs,
    showError,
    showSuccess,
    resetStats,
    startProcessing,
    endProcessing,
  };
}
