import React, { useState } from 'react';
import { X, Check, RotateCcw, AlertTriangle, ArrowRight } from 'lucide-react';

export interface NormalizationCorrection {
  fileName: string;
  workType?: string;
  variety?: string;
  detail?: string;
  station?: string;
  remarks?: string;
}

export interface OriginalData {
  fileName: string;
  workType: string;
  variety: string;
  detail: string;
  station: string;
  remarks: string;
}

interface Props {
  corrections: NormalizationCorrection[];
  originalData: OriginalData[];
  onApprove: (corrections: NormalizationCorrection[]) => void;
  onReject: () => void;
  onRetry: (customPrompt: string) => void;
  lang: 'en' | 'ja';
}

const NormalizationPreviewModal: React.FC<Props> = ({
  corrections,
  originalData,
  onApprove,
  onReject,
  onRetry,
  lang
}) => {
  const [selectedCorrections, setSelectedCorrections] = useState<Set<string>>(
    new Set(corrections.map(c => c.fileName))
  );
  const [customPrompt, setCustomPrompt] = useState('');
  const [showRetryInput, setShowRetryInput] = useState(false);

  const toggleCorrection = (fileName: string) => {
    const newSet = new Set(selectedCorrections);
    if (newSet.has(fileName)) {
      newSet.delete(fileName);
    } else {
      newSet.add(fileName);
    }
    setSelectedCorrections(newSet);
  };

  const handleApprove = () => {
    const approved = corrections.filter(c => selectedCorrections.has(c.fileName));
    onApprove(approved);
  };

  const handleRetry = () => {
    if (customPrompt.trim()) {
      onRetry(customPrompt.trim());
    }
  };

  const getOriginal = (fileName: string) => {
    return originalData.find(o => o.fileName === fileName);
  };

  const hasChanges = (correction: NormalizationCorrection, original: OriginalData | undefined) => {
    if (!original) return false;
    return (
      (correction.workType !== undefined && correction.workType !== original.workType) ||
      (correction.variety !== undefined && correction.variety !== original.variety) ||
      (correction.detail !== undefined && correction.detail !== original.detail) ||
      (correction.station !== undefined && correction.station !== original.station) ||
      (correction.remarks !== undefined && correction.remarks !== original.remarks)
    );
  };

  const renderChange = (label: string, oldVal: string, newVal: string | undefined) => {
    if (newVal === undefined || newVal === oldVal) return null;
    return (
      <div className="flex items-center gap-2 text-sm py-1">
        <span className="text-gray-500 w-16 flex-shrink-0">{label}</span>
        <span className="text-red-600 line-through bg-red-50 px-1 rounded max-w-[150px] truncate" title={oldVal}>
          {oldVal || '(空)'}
        </span>
        <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="text-green-600 bg-green-50 px-1 rounded max-w-[150px] truncate" title={newVal}>
          {newVal || '(空)'}
        </span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="bg-amber-500 text-white p-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" />
            <h2 className="text-lg font-bold">
              {lang === 'ja' ? '整合性チェック結果の確認' : 'Review Normalization Changes'}
            </h2>
          </div>
          <button onClick={onReject} className="p-1 hover:bg-white/20 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {corrections.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {lang === 'ja' ? '修正提案はありません' : 'No corrections proposed'}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">
                {lang === 'ja'
                  ? `AIが ${corrections.length} 件の修正を提案しています。適用する項目を選択してください。`
                  : `AI proposed ${corrections.length} corrections. Select which to apply.`}
              </p>

              {corrections.map(correction => {
                const original = getOriginal(correction.fileName);
                if (!original || !hasChanges(correction, original)) return null;

                const isSelected = selectedCorrections.has(correction.fileName);

                return (
                  <div
                    key={correction.fileName}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-gray-50 opacity-60'
                    }`}
                    onClick={() => toggleCorrection(correction.fileName)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCorrection(correction.fileName)}
                        className="w-4 h-4"
                      />
                      <span className="font-mono text-sm font-bold text-gray-700">
                        {correction.fileName}
                      </span>
                    </div>
                    <div className="pl-6 space-y-0.5">
                      {renderChange('工種', original.workType, correction.workType)}
                      {renderChange('種別', original.variety, correction.variety)}
                      {renderChange('細別', original.detail, correction.detail)}
                      {renderChange('測点', original.station, correction.station)}
                      {renderChange('備考', original.remarks, correction.remarks)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Retry with custom prompt */}
          {showRetryInput && (
            <div className="mt-4 p-3 bg-gray-100 rounded-lg">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                {lang === 'ja' ? '追加指示（やり直し用）' : 'Additional Instructions (for retry)'}
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={lang === 'ja'
                  ? '例: 備考は変更しないで。測点のOCRエラーだけ修正して。'
                  : 'e.g., Do not change remarks. Only fix station OCR errors.'}
                className="w-full h-24 p-2 border border-gray-300 rounded-lg text-sm resize-none"
              />
              <button
                onClick={handleRetry}
                disabled={!customPrompt.trim()}
                className="mt-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                {lang === 'ja' ? 'この指示でやり直し' : 'Retry with this prompt'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex justify-between items-center bg-gray-50 rounded-b-2xl">
          <button
            onClick={() => setShowRetryInput(!showRetryInput)}
            className="px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg font-medium flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {lang === 'ja' ? 'やり直し' : 'Retry'}
          </button>

          <div className="flex gap-3">
            <button
              onClick={onReject}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100"
            >
              {lang === 'ja' ? '全て却下' : 'Reject All'}
            </button>
            <button
              onClick={handleApprove}
              disabled={selectedCorrections.size === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {lang === 'ja'
                ? `選択した ${selectedCorrections.size} 件を適用`
                : `Apply ${selectedCorrections.size} selected`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NormalizationPreviewModal;
