import React from 'react';
import { Trash2 } from 'lucide-react';

interface ExamplesLayerProps {
  examples: any[];
  handleClearExamples: () => void;
  handleDeleteExample: (id: string) => void;
}

const ExampleItem: React.FC<{ example: any; onDelete: () => void }> = ({ example, onDelete }) => (
  <div className="bg-gray-50 p-2 rounded flex items-start gap-2">
    <div className="flex-1">
      <div className="font-medium text-sm">{example.name}</div>
      <div className="text-xs text-gray-500">{example.analysis.workType} / {example.analysis.variety} / {example.analysis.detail}</div>
      <div className="text-xs text-gray-400">備考: {example.analysis.remarks}</div>
    </div>
    <button onClick={onDelete} className="p-1 text-red-500 hover:bg-red-100 rounded"><Trash2 size={14} /></button>
  </div>
);

export const ExamplesLayer: React.FC<ExamplesLayerProps> = ({ examples, handleClearExamples, handleDeleteExample }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-600">登録済みお手本: {examples.length}件</div>
      {examples.length > 0 && (
        <button onClick={handleClearExamples} className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded">
          <Trash2 size={12} className="inline mr-1" />全削除
        </button>
      )}
    </div>
    {examples.length > 0 ? (
      <div className="space-y-2 max-h-60 overflow-auto">
        {examples.map((ex) => (
          <ExampleItem key={ex.id} example={ex} onDelete={() => handleDeleteExample(ex.id)} />
        ))}
      </div>
    ) : (
      <div className="text-gray-500 italic text-sm">お手本は未登録です。解析結果を右クリックして「お手本として登録」から追加できます。</div>
    )}
  </div>
);
