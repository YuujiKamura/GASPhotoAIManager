import React from 'react';
import { Loader2, Check, Circle, Minus, AlertCircle, Cpu } from 'lucide-react';
import type { AnalysisStep } from '../types';

interface Props {
  steps: AnalysisStep[];
  totalPhotos: number;
  processedPhotos: number;
}

export const AnalysisStepProgress: React.FC<Props> = ({ steps, totalPhotos, processedPhotos }) => {
  const overallProgress = totalPhotos > 0 ? (processedPhotos / totalPhotos) * 100 : 0;

  const getStatusIcon = (step: AnalysisStep) => {
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
      <h3 className="text-white font-bold mb-3 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-blue-400" /> AI解析の進捗
      </h3>

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
            {step.subProgress && step.status === 'running' && (
              <span className="text-amber-400 text-xs">{step.subProgress}</span>
            )}
          </div>
        ))}
      </div>

      {/* Overall Progress Bar */}
      <div className="mt-4">
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="text-xs text-slate-400 mt-1 text-right">
          {processedPhotos}/{totalPhotos}枚
        </div>
      </div>
    </div>
  );
};

export default AnalysisStepProgress;
