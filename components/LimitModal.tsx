import React from 'react';
import { ListFilter } from 'lucide-react';
import { TRANS } from '../utils/translations';

interface LimitModalProps {
  totalFiles: number;
  maxPhotos: number;
  selectionStart: number;
  selectionCount: number;
  lang: 'en' | 'ja';
  onStartChange: (val: number) => void;
  onCountChange: (val: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const LimitModal: React.FC<LimitModalProps> = ({
  totalFiles,
  maxPhotos,
  selectionStart,
  selectionCount,
  lang,
  onStartChange,
  onCountChange,
  onCancel,
  onConfirm
}) => {
  const txt = TRANS[lang];

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4 text-amber-600">
          <ListFilter className="w-8 h-8" />
          <h3 className="text-xl font-bold">{txt.limitTitle}</h3>
        </div>
        <p className="text-gray-600 mb-6">{txt.limitDesc(totalFiles)}</p>
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">{txt.startLabel}</label>
            <input 
              type="number" 
              min={1} 
              max={totalFiles}
              value={selectionStart}
              onChange={(e) => onStartChange(parseInt(e.target.value) || 1)}
              className="w-full border border-gray-300 rounded-lg p-3 text-lg font-mono focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">{txt.rangeLabel}</label>
            <input 
              type="number" 
              min={1} 
              max={maxPhotos}
              value={selectionCount}
              onChange={(e) => onCountChange(parseInt(e.target.value) || 1)}
              className="w-full border border-gray-300 rounded-lg p-3 text-lg font-mono focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>
          <div className="bg-gray-100 p-3 rounded text-center text-sm font-bold text-gray-700">
            {txt.rangePreview(selectionStart, Math.min(totalFiles, selectionStart + selectionCount - 1))}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-bold">{txt.btnCancel}</button>
          <button onClick={onConfirm} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md">{txt.btnProcess}</button>
        </div>
      </div>
    </div>
  );
};

export default LimitModal;