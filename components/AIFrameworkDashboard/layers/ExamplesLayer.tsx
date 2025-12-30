import React from 'react';
import { Trash2 } from 'lucide-react';
import { AnalysisExample } from '../../../types';

interface ExamplesLayerProps {
  examples: AnalysisExample[];
  handleClearExamples: () => void;
  handleDeleteExample: (id: string) => void;
}

export const ExamplesLayer: React.FC<ExamplesLayerProps> = ({
  examples,
  handleClearExamples,
  handleDeleteExample,
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-600">登録済みお手本: {examples.length}件</div>
      {examples.length > 0 && (
        <button
          onClick={handleClearExamples}
          className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded"
        >
          <Trash2 size={12} className="inline mr-1" />全削除
        </button>
      )}
    </div>
    {examples.length > 0 ? (
      <div className="space-y-2 max-h-60 overflow-auto">
        {examples.map((ex) => (
          <div key={ex.id} className="bg-gray-50 p-2 rounded flex items-start gap-2">
            <div className="flex-1">
              <div className="font-medium text-sm">{ex.name}</div>
              <div className="text-xs text-gray-500">
                {ex.analysis.workType} / {ex.analysis.variety} / {ex.analysis.detail}
              </div>
              <div className="text-xs text-gray-400">備考: {ex.analysis.remarks}</div>
            </div>
            <button
              onClick={() => handleDeleteExample(ex.id)}
              className="p-1 text-red-500 hover:bg-red-100 rounded"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-gray-500 italic text-sm">
        お手本は未登録です。解析結果を右クリックして「お手本として登録」から追加できます。
      </div>
    )}
  </div>
);
