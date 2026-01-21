import React from 'react';
import { Loader2, Check, Circle, Minus, AlertCircle, Cpu, Pause, Play, Zap, MessageCircle } from 'lucide-react';
import type { AnalysisStep, AnalysisMode, AnalysisPauseState } from '../types';

interface Props {
  steps: AnalysisStep[];
  totalPhotos: number;
  processedPhotos: number;
  // 一時停止/再開機能
  analysisMode?: AnalysisMode;
  pauseState?: AnalysisPauseState;
  onToggleMode?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

export const AnalysisStepProgress: React.FC<Props> = ({
  steps,
  totalPhotos,
  processedPhotos,
  analysisMode = 'auto',
  pauseState,
  onToggleMode,
  onPause,
  onResume,
}) => {
  const overallProgress = totalPhotos > 0 ? (processedPhotos / totalPhotos) * 100 : 0;
  const isPaused = pauseState?.isPaused ?? false;
  const canResume = pauseState?.canResume ?? false;

  const getStatusIcon = (step: AnalysisStep) => {
    // 一時停止中で、このステップで止まっている場合
    if (isPaused && pauseState?.pausedAtStep === step.id) {
      return <Pause className="w-4 h-4 text-yellow-400" />;
    }
    switch (step.status) {
      case 'done':
        return <Check className="w-4 h-4 text-green-400" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />;
      case 'skipped':
        return <Minus className="w-4 h-4 text-slate-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Circle className="w-4 h-4 text-slate-500" />;
    }
  };

  const getTextColor = (step: AnalysisStep) => {
    if (isPaused && pauseState?.pausedAtStep === step.id) {
      return 'text-yellow-300';
    }
    switch (step.status) {
      case 'running':
        return 'text-amber-300';
      case 'done':
        return 'text-green-300';
      case 'error':
        return 'text-red-300';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 w-80 shadow-xl border border-slate-600">
      {/* Header with Mode Toggle */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-bold flex items-center gap-2">
          <Cpu className="w-4 h-4 text-blue-400" /> AI解析の進捗
        </h3>
        {onToggleMode && (
          <button
            onClick={onToggleMode}
            className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors ${
              analysisMode === 'interactive'
                ? 'bg-purple-600 text-white hover:bg-purple-500'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            title={analysisMode === 'auto' ? '対話モードに切替' : '自動モードに切替'}
          >
            {analysisMode === 'interactive' ? (
              <><MessageCircle className="w-3 h-3" /> 対話</>
            ) : (
              <><Zap className="w-3 h-3" /> 自動</>
            )}
          </button>
        )}
      </div>

      {/* Steps List */}
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-2 text-sm">
            {/* Status Icon */}
            {getStatusIcon(step)}

            {/* Step Name */}
            <span className={`flex-1 ${getTextColor(step)}`}>
              {i + 1}. {step.name}
            </span>

            {/* Result or SubProgress */}
            {step.result && (
              <span className="text-slate-400 text-xs">{step.result}</span>
            )}
            {step.subProgress && step.status === 'running' && !isPaused && (
              <span className="text-amber-400 text-xs">{step.subProgress}</span>
            )}
          </div>
        ))}
      </div>

      {/* Overall Progress Bar */}
      <div className="mt-4">
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${isPaused ? 'bg-yellow-500' : 'bg-blue-500'}`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="text-xs text-slate-400 mt-1 text-right">
          {processedPhotos}/{totalPhotos}枚
        </div>
      </div>

      {/* Pause/Resume Controls */}
      {(onPause || onResume) && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          {isPaused ? (
            <div className="space-y-2">
              <div className="text-xs text-yellow-400 flex items-center gap-1">
                <Pause className="w-3 h-3" /> 一時停止中
              </div>
              {canResume && onResume && (
                <button
                  onClick={onResume}
                  className="w-full px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded flex items-center justify-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4" /> 再開
                </button>
              )}
            </div>
          ) : (
            onPause && (
              <button
                onClick={onPause}
                className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded flex items-center justify-center gap-2 transition-colors"
              >
                <Pause className="w-4 h-4" /> 一時停止
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default AnalysisStepProgress;
