import React from 'react';
import { Loader2, Check, Circle, Minus, AlertCircle, Pause } from 'lucide-react';
import type { Step, StepStatus } from '../../hooks/useStepProgress';

interface StepProgressCoreProps<T extends string = string> {
  /** ステップの配列 */
  steps: Step<T>[];
  /** タイトル（省略可） */
  title?: string;
  /** タイトル横に表示するアイコン（省略可） */
  titleIcon?: React.ReactNode;
  /** 全体進捗バーを表示するか */
  showOverallProgress?: boolean;
  /** 処理総数（全体進捗用） */
  totalCount?: number;
  /** 処理済み数（全体進捗用） */
  processedCount?: number;
  /** 一時停止中のステップID（省略可） */
  pausedAtStepId?: T;
  /** コンパクトモード */
  compact?: boolean;
  /** 追加のクラス名 */
  className?: string;
  /** 子要素（フッターに表示） */
  children?: React.ReactNode;
}

/**
 * ステップ進捗表示の純粋UIコンポーネント
 *
 * バッチ解析・対話型解析両方で使用可能な汎用コンポーネント。
 * pause/resumeボタン等のコントロールは親コンポーネントでchildrenとして渡す。
 */
export function StepProgressCore<T extends string = string>({
  steps,
  title,
  titleIcon,
  showOverallProgress = false,
  totalCount = 0,
  processedCount = 0,
  pausedAtStepId,
  compact = false,
  className = '',
  children,
}: StepProgressCoreProps<T>): React.ReactElement {
  const overallProgress = totalCount > 0 ? (processedCount / totalCount) * 100 : 0;
  const isPaused = !!pausedAtStepId;

  const getStatusIcon = (step: Step<T>) => {
    // 一時停止中で、このステップで止まっている場合
    if (pausedAtStepId === step.id) {
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

  const getTextColor = (step: Step<T>) => {
    if (pausedAtStepId === step.id) {
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

  const containerClass = compact
    ? 'bg-slate-800/80 rounded-lg p-3 shadow-lg border border-slate-700'
    : 'bg-slate-800 rounded-lg p-4 w-80 shadow-xl border border-slate-600';

  return (
    <div className={`${containerClass} ${className}`}>
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold flex items-center gap-2">
            {titleIcon}
            {title}
          </h3>
        </div>
      )}

      {/* Steps List */}
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        {steps.map((step, i) => (
          <div key={step.id} className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
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
      {showOverallProgress && totalCount > 0 && (
        <div className="mt-4">
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${isPaused ? 'bg-yellow-500' : 'bg-blue-500'}`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <div className="text-xs text-slate-400 mt-1 text-right">
            {processedCount}/{totalCount}枚
          </div>
        </div>
      )}

      {/* Footer (children) */}
      {children && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          {children}
        </div>
      )}
    </div>
  );
}

export default StepProgressCore;
