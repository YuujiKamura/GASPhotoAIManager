import React, { useEffect, useState } from 'react';
import { CheckCircle, Settings, AlertTriangle, X } from 'lucide-react';

interface Props {
  lang: 'en' | 'ja';
  onConfirm: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}

const ENABLED_WORK_TYPES_KEY = 'construction_enabled_work_types';

// 有効な工種をlocalStorageから取得
const loadEnabledWorkTypes = (): string[] => {
  try {
    const saved = localStorage.getItem(ENABLED_WORK_TYPES_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // ignore
  }
  return [];
};

const WorkTypeConfirmModal: React.FC<Props> = ({ lang, onConfirm, onCancel, onOpenSettings }) => {
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);

  useEffect(() => {
    setEnabledTypes(loadEnabledWorkTypes());
  }, []);

  const txt = {
    title: lang === 'ja' ? '使用工種の確認' : 'Confirm Work Types',
    description: lang === 'ja'
      ? '以下の工種を使用してAI解析を行います。'
      : 'The following work types will be used for AI analysis.',
    noTypes: lang === 'ja'
      ? '有効な工種がありません。工種設定で工種を有効にしてください。'
      : 'No work types enabled. Please enable work types in settings.',
    enabledCount: lang === 'ja' ? '有効な工種' : 'Enabled types',
    confirm: lang === 'ja' ? '解析開始' : 'Start Analysis',
    cancel: lang === 'ja' ? 'キャンセル' : 'Cancel',
    settings: lang === 'ja' ? '工種設定' : 'Settings',
  };

  const hasEnabledTypes = enabledTypes.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-xl">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <h3 className="font-bold text-lg">{txt.title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-white/20 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          <p className="text-gray-600 text-sm mb-4">{txt.description}</p>

          {hasEnabledTypes ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">{txt.enabledCount}</span>
                <span className="text-sm font-bold text-blue-600">{enabledTypes.length}</span>
              </div>
              <div className="bg-gray-50 rounded-lg border p-3 max-h-60 overflow-auto">
                <div className="flex flex-wrap gap-2">
                  {enabledTypes.sort((a, b) => a.localeCompare(b, 'ja')).map(type => (
                    <span
                      key={type}
                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-amber-700 text-sm">{txt.noTypes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
            {txt.settings}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {txt.cancel}
            </button>
            <button
              onClick={onConfirm}
              disabled={!hasEnabledTypes}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
                hasEnabledTypes
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {txt.confirm}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkTypeConfirmModal;
