import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Wand2, Star, Brain, AlertTriangle } from 'lucide-react';

interface ContextMenuState {
  x: number;
  y: number;
  targetFileName: string;
}

interface Props {
  contextMenu: ContextMenuState | null;
  lang: 'en' | 'ja';
  isSavingExample: boolean;
  onClose: () => void;
  onReanalyze: () => void;
  onShowReasoning: () => void;
  onSaveAsExample: () => void;
  onReportIssue: () => void;
  onDelete: () => void;
  txt: { showReasoning: string; reportIssue: string };
}

export const ContextMenu: React.FC<Props> = ({
  contextMenu, lang, isSavingExample, onClose,
  onReanalyze, onShowReasoning, onSaveAsExample, onReportIssue, onDelete, txt
}) => {
  if (!contextMenu) return null;

  return createPortal(
    <div
      className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[150px] animate-in fade-in zoom-in duration-100"
      style={{ top: contextMenu.y, left: contextMenu.x }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 border-b border-gray-100 text-xs text-gray-500 font-bold bg-gray-50">
        {lang === 'ja' ? '操作' : 'Action'}
      </div>
      <button onClick={onReanalyze} className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2">
        <Wand2 className="w-4 h-4" />
        {lang === 'ja' ? 'この画像を再解析' : 'Re-analyze Photo'}
      </button>
      <button onClick={onShowReasoning} className="w-full text-left px-4 py-2 text-sm text-purple-600 hover:bg-purple-50 flex items-center gap-2">
        <Brain className="w-4 h-4" />
        {txt.showReasoning}
      </button>
      <button onClick={onSaveAsExample} disabled={isSavingExample} className="w-full text-left px-4 py-2 text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2 disabled:opacity-50">
        <Star className="w-4 h-4" />
        {lang === 'ja' ? 'お手本として保存' : 'Save as Example'}
      </button>
      <button onClick={onReportIssue} className="w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        {txt.reportIssue}
      </button>
      <button onClick={onDelete} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
        <Trash2 className="w-4 h-4" />
        {lang === 'ja' ? '削除する' : 'Delete Photo'}
      </button>
    </div>,
    document.body
  );
};
