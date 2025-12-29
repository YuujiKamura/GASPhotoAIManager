import React from 'react';
import { createPortal } from 'react-dom';
import { Brain, X } from 'lucide-react';
import { AIAnalysisResult } from '../../types';
import { STAGE_LABELS, FIELD_LABELS } from '../../utils/displayLabels';

interface ReasoningModalState {
  fileName: string;
  reasoning: string;
  analysis: AIAnalysisResult;
}

interface Props {
  modal: ReasoningModalState | null;
  onClose: () => void;
  lang: 'en' | 'ja';
  txt: {
    reasoningTitle: string;
    labelWorkType: string;
    labelVariety: string;
    labelDetail: string;
    labelRemarks: string;
    labelMeasurements: string;
    labelStation: string;
    noReasoning: string;
    changeLogTitle: string;
    changedFrom: string;
    noChanges: string;
    closeBtn: string;
  };
}

export const ReasoningModal: React.FC<Props> = ({ modal, onClose, lang, txt }) => {
  if (!modal) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><Brain className="w-5 h-5 text-purple-600" /></div>
            <div>
              <h3 className="font-bold text-gray-900">{txt.reasoningTitle}</h3>
              <p className="text-sm text-gray-500">{modal.fileName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Analysis Summary */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {modal.analysis.workType && <div><span className="text-gray-500">{txt.labelWorkType}:</span> <span className="font-medium">{modal.analysis.workType}</span></div>}
            {modal.analysis.variety && <div><span className="text-gray-500">{txt.labelVariety}:</span> <span className="font-medium">{modal.analysis.variety}</span></div>}
            {modal.analysis.detail && <div><span className="text-gray-500">{txt.labelDetail}:</span> <span className="font-medium">{modal.analysis.detail}</span></div>}
            {modal.analysis.remarks && <div><span className="text-gray-500">{txt.labelRemarks}:</span> <span className="font-medium">{modal.analysis.remarks}</span></div>}
            {modal.analysis.measurements && <div><span className="text-gray-500">{txt.labelMeasurements}:</span> <span className="font-medium">{modal.analysis.measurements}</span></div>}
            {modal.analysis.station && <div><span className="text-gray-500">{txt.labelStation}:</span> <span className="font-medium">{modal.analysis.station}</span></div>}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {modal.reasoning ? (
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed bg-gradient-to-br from-purple-50/50 to-indigo-50/50 p-4 rounded-lg border border-purple-100">
                {modal.reasoning}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="p-3 bg-gray-100 rounded-full w-fit mx-auto mb-3"><Brain className="w-6 h-6 text-gray-400" /></div>
              <p className="text-gray-500 text-sm">{txt.noReasoning}</p>
              <p className="text-xs text-gray-400 mt-1">
                {lang === 'ja' ? '再解析を行うと判断根拠が記録されます' : 'Re-analyze the photo to record AI reasoning'}
              </p>
            </div>
          )}

          {/* Change History */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-5 h-5 bg-amber-100 rounded flex items-center justify-center text-amber-600 text-xs">📝</span>
              {txt.changeLogTitle}
            </h4>
            {modal.analysis.changeLog && modal.analysis.changeLog.length > 0 ? (
              <div className="space-y-2">
                {modal.analysis.changeLog.map((change, idx) => {
                  const stageInfo = STAGE_LABELS[change.stage];
                  const fieldInfo = FIELD_LABELS[change.field] || { ja: change.field, en: change.field };
                  return (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 text-sm border border-gray-100">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${stageInfo.color}`}>
                          {lang === 'ja' ? stageInfo.ja : stageInfo.en}
                        </span>
                        <span className="font-medium text-gray-700">{lang === 'ja' ? fieldInfo.ja : fieldInfo.en}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500">{txt.changedFrom}:</span>
                        <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded line-through">{change.before || '(空)'}</span>
                        <span className="text-gray-400">→</span>
                        <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded font-medium">{change.after || '(空)'}</span>
                      </div>
                      {change.reason && <div className="text-xs text-gray-500 mt-1 italic">{change.reason}</div>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-400 text-sm bg-gray-50 rounded-lg">{txt.noChanges}</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="w-full py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors font-medium">
            {txt.closeBtn}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
