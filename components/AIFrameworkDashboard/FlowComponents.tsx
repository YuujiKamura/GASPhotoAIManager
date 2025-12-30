import React from 'react';
import { ArrowRight } from 'lucide-react';
import { FlowStep } from './types';

interface FlowStepItemProps {
  step: FlowStep;
  index: number;
  isLast: boolean;
  onToggle: () => void;
}

export const FlowStepItem: React.FC<FlowStepItemProps> = ({ step, index, isLast, onToggle }) => (
  <div className="flex items-start gap-3 mb-4">
    <div className="flex flex-col items-center">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
        !step.enabled ? 'bg-gray-200 text-gray-400' : step.optional ? 'bg-yellow-500 text-white' : 'bg-blue-600 text-white'
      }`}>{index + 1}</div>
      {!isLast && <div className={`w-0.5 h-8 ${step.enabled ? 'bg-blue-200' : 'bg-gray-200'}`} />}
    </div>
    <div className={`flex-1 p-3 rounded border ${
      !step.enabled ? 'border-gray-200 bg-gray-50 opacity-50' : step.optional ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">{step.icon}</span>
        <span className="font-medium">{step.name}</span>
        {step.optional && (
          <label className="flex items-center gap-1 ml-auto cursor-pointer">
            <input type="checkbox" checked={step.enabled} onChange={onToggle} className="rounded" />
            <span className="text-xs text-gray-500">Enabled</span>
          </label>
        )}
      </div>
      <div className="text-sm text-gray-600 mt-1">{step.description}</div>
    </div>
  </div>
);

interface FlowSummaryProps {
  flowSettings: { detect: boolean; worktype: boolean; normalize: boolean; scene: boolean };
}

export const FlowSummary: React.FC<FlowSummaryProps> = ({ flowSettings }) => (
  <div className="border rounded p-4 bg-gray-50">
    <div className="text-sm font-medium mb-3">Flow Summary</div>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="px-2 py-1 bg-blue-100 rounded">Photo</span>
      <ArrowRight size={14} className="text-gray-400" />
      <span className={`px-2 py-1 rounded ${flowSettings.detect ? 'bg-yellow-100' : 'bg-gray-200 line-through'}`}>Detection</span>
      <ArrowRight size={14} className="text-gray-400" />
      <span className="px-2 py-1 bg-green-100 rounded">Gemini API</span>
      <ArrowRight size={14} className="text-gray-400" />
      <span className="px-2 py-1 bg-purple-100 rounded">Validation</span>
      <ArrowRight size={14} className="text-gray-400" />
      <span className="px-2 py-1 bg-orange-100 rounded">Result</span>
    </div>
  </div>
);
