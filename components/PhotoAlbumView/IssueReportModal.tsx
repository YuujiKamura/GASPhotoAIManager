import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { PhotoRecord, IssueType } from '../../types';

interface IssueModalState {
  record: PhotoRecord;
}

interface Props {
  modal: IssueModalState | null;
  onClose: () => void;
  lang: 'en' | 'ja';
  issueType: IssueType;
  setIssueType: (type: IssueType) => void;
  issueDescription: string;
  setIssueDescription: (desc: string) => void;
  isSaving: boolean;
  onSave: () => void;
  txt: {
    issueTitle: string;
    labelWorkType: string;
    labelRemarks: string;
    issueTypeLabel: string;
    issueTypes: Record<IssueType, string>;
    issueDescPlaceholder: string;
    closeBtn: string;
    saveIssue: string;
  };
}

export const IssueReportModal: React.FC<Props> = ({
  modal, onClose, lang, issueType, setIssueType, issueDescription, setIssueDescription, isSaving, onSave, txt
}) => {
  if (!modal) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-amber-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg"><AlertTriangle className="w-5 h-5 text-orange-600" /></div>
            <div>
              <h3 className="font-bold text-gray-900">{txt.issueTitle}</h3>
              <p className="text-sm text-gray-500">{modal.record.fileName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Current Analysis Summary */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="text-xs text-gray-500 mb-2">{lang === 'ja' ? '現在の解析結果' : 'Current Analysis'}</div>
          <div className="grid grid-cols-2 gap-1 text-sm">
            {modal.record.analysis?.workType && (
              <div><span className="text-gray-500">{txt.labelWorkType}:</span> <span className="font-medium">{modal.record.analysis.workType}</span></div>
            )}
            {modal.record.analysis?.remarks && (
              <div><span className="text-gray-500">{txt.labelRemarks}:</span> <span className="font-medium">{modal.record.analysis.remarks}</span></div>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{txt.issueTypeLabel}</label>
            <select
              value={issueType}
              onChange={(e) => setIssueType(e.target.value as IssueType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="wrong_classification">{txt.issueTypes.wrong_classification}</option>
              <option value="wrong_inheritance">{txt.issueTypes.wrong_inheritance}</option>
              <option value="master_rejection">{txt.issueTypes.master_rejection}</option>
              <option value="temperature_error">{txt.issueTypes.temperature_error}</option>
              <option value="ocr_error">{txt.issueTypes.ocr_error}</option>
              <option value="other">{txt.issueTypes.other}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {lang === 'ja' ? '問題の説明' : 'Description'}
            </label>
            <textarea
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              placeholder={txt.issueDescPlaceholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 h-24 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors font-medium">
            {txt.closeBtn}
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !issueDescription.trim()}
            className="flex-1 py-2 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {txt.saveIssue}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
