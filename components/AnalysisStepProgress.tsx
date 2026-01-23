import React from 'react';
import { Cpu, Pause, Play, Zap, MessageCircle } from 'lucide-react';
import { StepProgressCore } from './StepProgress';
import type { AnalysisStep, AnalysisStepId, AnalysisMode, AnalysisPauseState } from '../types';

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

/**
 * バッチ解析用の進捗表示コンポーネント
 *
 * StepProgressCoreをベースに、pause/resume UIとモード切替を追加。
 */
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
  const isPaused = pauseState?.isPaused ?? false;
  const canResume = pauseState?.canResume ?? false;

  // ヘッダー右側のモード切替ボタン
  const modeToggle = onToggleMode && (
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
  );

  return (
    <div className="bg-slate-800 rounded-lg p-4 w-80 shadow-xl border border-slate-600">
      {/* Header with Mode Toggle */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-bold flex items-center gap-2">
          <Cpu className="w-4 h-4 text-blue-400" /> AI解析の進捗
        </h3>
        {modeToggle}
      </div>

      {/* StepProgressCoreを使用（タイトルは上で表示済みなので省略） */}
      <StepProgressCore<AnalysisStepId>
        steps={steps}
        showOverallProgress={true}
        totalCount={totalPhotos}
        processedCount={processedPhotos}
        pausedAtStepId={pauseState?.pausedAtStep}
        className="!bg-transparent !p-0 !border-0 !shadow-none !w-auto"
      />

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
