import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PhotoRecord, AppMode, AIAnalysisResult, FieldChange, ChangeStage } from '../types';
import { TRANS } from '../utils/translations';
import { Trash2, Wand2, Star, Brain, X } from 'lucide-react';
import { LAYOUT_FIELDS } from '../utils/layoutConfig';
import { saveExample } from '../utils/storage';

// 変更段階の日本語表示
const STAGE_LABELS: Record<ChangeStage, { ja: string; en: string; color: string }> = {
  'ai_initial': { ja: 'AI初期解析', en: 'AI Initial', color: 'bg-blue-100 text-blue-700' },
  'context_relay': { ja: '前後継承', en: 'Context Relay', color: 'bg-green-100 text-green-700' },
  'master_validation': { ja: 'マスタ検証', en: 'Master Validation', color: 'bg-orange-100 text-orange-700' },
  'temperature_validation': { ja: '温度検証', en: 'Temp Validation', color: 'bg-red-100 text-red-700' },
  'normalization': { ja: '正規化', en: 'Normalization', color: 'bg-purple-100 text-purple-700' },
  'user_edit': { ja: 'ユーザー編集', en: 'User Edit', color: 'bg-gray-100 text-gray-700' }
};

// フィールド名の日本語表示
const FIELD_LABELS: Record<string, { ja: string; en: string }> = {
  'workType': { ja: '工種', en: 'Work Type' },
  'variety': { ja: '種別', en: 'Variety' },
  'detail': { ja: '細別', en: 'Detail' },
  'station': { ja: '測点', en: 'Station' },
  'remarks': { ja: '備考', en: 'Remarks' },
  'remarksCategory': { ja: '備考カテゴリ', en: 'Remarks Category' },
  'measurements': { ja: '測定値', en: 'Measurements' },
  'description': { ja: '記事', en: 'Description' }
};

interface Props {
  records: PhotoRecord[];
  appMode: AppMode;
  lang: 'en' | 'ja';
  photosPerPage: 2 | 3;
  onUpdatePhoto: (fileName: string, field: keyof AIAnalysisResult, value: string) => void;
  onDeletePhoto?: (fileName: string) => void;
  onReanalyzePhoto?: (fileName: string) => void;
}

/**
 * A field that is an Input/Textarea on screen (for editing),
 * but becomes a plain Div in PDF mode (for proper text wrapping/rendering).
 */
const EditableField = ({
  value,
  onChange,
  multiline = false,
  align = 'left',
  textClass = "text-sm text-gray-900"
}: {
  value: string;
  onChange: (val: string) => void;
  multiline?: boolean;
  align?: 'left' | 'center';
  textClass?: string;
}) => {
  // Unified typography: text-sm, text-gray-900, tight leading
  const baseClass = `w-full h-full bg-transparent border-none outline-none focus:bg-yellow-50 focus:ring-1 focus:ring-amber-300 hover:bg-black/5 rounded-sm transition-colors leading-tight font-normal block ${textClass}`;
  const alignClass = align === 'center' ? 'text-center' : 'text-left';
  // Minimal padding to fit text-sm in h-[28px] rows
  const paddingClass = multiline ? 'p-1' : 'px-1 py-0.5';

  return (
    <div className="relative w-full h-full group overflow-hidden">
      {/* Screen Mode: Editable Input */}
      <div className="pdf-hidden w-full h-full">
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${baseClass} resize-none [&::-webkit-scrollbar]:hidden ${alignClass} ${paddingClass}`}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${baseClass} ${alignClass} ${paddingClass}`}
          />
        )}
      </div>

      {/* PDF/Print Mode: Static Text */}
      <div className={`pdf-visible hidden w-full h-full leading-tight break-words whitespace-pre-wrap font-normal ${alignClass} ${paddingClass} ${textClass}`}>
        {value}
      </div>
    </div>
  );
};

interface InfoRowProps {
  label: string;
  value: string;
  className?: string; // Handles height and borders
  onChange: (val: string) => void;
  align?: 'left' | 'center';
  multiline?: boolean;
  readOnly?: boolean;
  hideLabel?: boolean; // New prop to toggle label visibility
  textClass?: string;
  children?: React.ReactNode;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, className = "", onChange, align = 'left', multiline = false, readOnly = false, hideLabel = false, textClass, children }) => (
  // Use className for height control
  // Note: removed last:border-b-0 to always show bottom border (even when description is hidden)
  <div className={`flex border-b border-gray-300 box-border w-full ${className}`}>
    {/* Label: Fixed width w-12 (48px) - Only render if not hidden */}
    {!hideLabel && (
      <div className={`w-12 flex justify-center text-sm text-gray-900 font-normal flex-shrink-0 leading-tight px-0.5 text-center select-none bg-gray-50/50 border-r border-gray-300 ${multiline ? 'items-start pt-1' : 'items-center'}`}>
        {label}
      </div>
    )}
    {/* Content Area */}
    <div className="flex-1 relative min-w-0 bg-white h-full overflow-hidden">
      {readOnly ? (
        <div className="w-full h-full px-1 py-0.5 flex items-center justify-between text-sm text-gray-900 leading-tight font-normal">
          <span className="truncate">{value}</span>
          {children}
        </div>
      ) : (
        <EditableField
          value={value}
          onChange={onChange}
          multiline={multiline}
          align={align as 'left' | 'center'}
          textClass={textClass}
        />
      )}
    </div>
  </div>
);

type ContextMenuState = {
  x: number;
  y: number;
  targetFileName: string;
} | null;

type ReasoningModalState = {
  fileName: string;
  reasoning: string;
  analysis: AIAnalysisResult;
} | null;

const PhotoAlbumView: React.FC<Props> = ({ records, appMode, lang, photosPerPage, onUpdatePhoto, onDeletePhoto, onReanalyzePhoto }) => {
  const txt = TRANS[lang];
  const totalPages = Math.ceil(records.length / photosPerPage);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [isSavingExample, setIsSavingExample] = useState(false);
  const [reasoningModal, setReasoningModal] = useState<ReasoningModalState>(null);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('resize', handleClickOutside); // Close on resize too
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('resize', handleClickOutside);
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent, fileName: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetFileName: fileName
    });
  };

  const executeDelete = () => {
    if (contextMenu && onDeletePhoto) {
      onDeletePhoto(contextMenu.targetFileName);
      setContextMenu(null);
    }
  };

  const executeSaveAsExample = async () => {
    if (!contextMenu) return;

    const record = records.find(r => r.fileName === contextMenu.targetFileName);
    if (!record?.analysis) {
      alert(lang === 'ja' ? '解析結果がありません' : 'No analysis result');
      setContextMenu(null);
      return;
    }

    setIsSavingExample(true);
    try {
      const exampleName = prompt(
        lang === 'ja' ? 'お手本の名前を入力してください:' : 'Enter a name for this example:',
        `${record.analysis.workType || ''} - ${record.analysis.remarks || record.fileName}`
      );

      if (exampleName) {
        await saveExample(record, exampleName);
        alert(lang === 'ja' ? 'お手本として保存しました' : 'Saved as example');
      }
    } catch (e) {
      console.error('Failed to save example:', e);
      alert(lang === 'ja' ? '保存に失敗しました' : 'Failed to save');
    } finally {
      setIsSavingExample(false);
      setContextMenu(null);
    }
  };

  const executeShowReasoning = () => {
    if (!contextMenu) return;

    const record = records.find(r => r.fileName === contextMenu.targetFileName);
    if (!record?.analysis) {
      alert(lang === 'ja' ? '解析結果がありません' : 'No analysis result');
      setContextMenu(null);
      return;
    }

    setReasoningModal({
      fileName: record.fileName,
      reasoning: record.analysis.reasoning || '',
      analysis: record.analysis
    });
    setContextMenu(null);
  };

  const isTwoUp = photosPerPage === 2;

  // Fields Config
  // 3-up: All Fields (measurements always shown for input)
  // 2-up: Only Remarks, Station (in that order)
  const getVisibleFields = () => {
    if (isTwoUp) {
      return [
        LAYOUT_FIELDS.find(f => f.key === 'remarks')!,
        LAYOUT_FIELDS.find(f => f.key === 'station')!
      ].filter(Boolean);
    }

    // 3-up mode: all fields including measurements (always shown)
    return LAYOUT_FIELDS;
  };

  return (
    <div id="album-content" className="w-full">
      {Array.from({ length: totalPages }).map((_, pageIndex) => (
        <div key={pageIndex} className="sheet-preview px-12 py-6 mb-8 relative flex flex-col box-border h-[297mm]">

          {/* Page Header */}
          <div className="flex justify-between items-end mb-2 w-full flex-shrink-0">
            <h1 className="text-xl font-bold text-gray-900 border-b-2 border-gray-900 leading-none pb-1 px-1">
              {appMode === 'construction' ? '工事写真帳' : 'Photo Album'}
            </h1>
            <div className="text-sm font-bold text-gray-800">
              Page <span className="text-lg">{pageIndex + 1}</span>
            </div>
          </div>

          {/* Main Content Border Box - Flex 1 ensures it fills the page */}
          <div className="flex flex-col flex-1 border border-gray-400 bg-white min-h-0">
            {Array.from({ length: photosPerPage }).map((_, slotIndex) => {
              const photoIndex = pageIndex * photosPerPage + slotIndex;
              const record = records[photoIndex];

              // Dynamic Layout Classes

              // Slot Container
              // 3-up: Row Layout, 33% Height
              // 2-up: Col Layout, 50% Height
              const slotClass = isTwoUp
                ? "flex-1 border-b border-gray-300 last:border-b-0 flex flex-col box-border min-h-0 hover:bg-gray-50 transition-colors h-[50%]"
                : "flex-1 border-b border-gray-300 last:border-b-0 flex flex-row box-border min-h-0 hover:bg-gray-50 transition-colors h-[33.33%]";

              // Image Container
              // 3-up: 65% width, Right Border, Normal Padding
              // 2-up: 100% width, Flex-1 (Takes remaining height), Bottom Border, Minimal Padding (0.5) to maximize image
              const imageContainerClass = isTwoUp
                ? "w-full flex-1 border-r-0 border-b border-gray-300 flex items-center justify-center bg-white relative overflow-hidden group cursor-context-menu p-0.5"
                : "w-[65%] border-r border-gray-300 flex items-center justify-center bg-white relative overflow-hidden group cursor-context-menu";

              // Info Container
              // 3-up: 35% width
              // 2-up: 100% width, takes about 20% of slot height for remarks + station
              const infoContainerClass = isTwoUp
                ? "w-full h-[20%] bg-white flex flex-col justify-start py-1 px-4"
                : "w-[35%] flex flex-col h-full bg-white";

              if (!record) {
                return <div key={`empty-${slotIndex}`} className={slotClass}></div>;
              }

              return (
                <div
                  key={record.fileName}
                  className={slotClass}
                  onContextMenu={(e) => handleContextMenu(e, record.fileName)}
                >
                  {/* Image Section */}
                  <div className={imageContainerClass}>
                    <img src={record.base64} alt={record.fileName} className="max-w-full max-h-full object-contain" />
                  </div>

                  {/* Info Section */}
                  <div className={infoContainerClass}>
                    {getVisibleFields().map((field) => {
                      // Resolve value
                      let val = "";
                      if (field.key === 'date') {
                        val = record.date
                          ? new Date(record.date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                          : '';
                      } else {
                        val = record.analysis ? (record.analysis[field.key as keyof AIAnalysisResult] as string || "") : "";
                      }

                      const extraUI = null;

                      // Determine height class dynamically
                      let dynamicHeightClass = field.heightClass;
                      let dynamicTextClass = undefined;
                      if (isTwoUp) {
                        // In 2-up vertical mode
                        if (field.key === 'remarks') {
                          // Remarks takes most of the info container space
                          dynamicHeightClass = 'flex-1 min-h-[60px] border-none';
                          dynamicTextClass = 'text-sm text-gray-900 font-medium';
                        } else {
                          // Station stays compact
                          dynamicHeightClass = 'h-[28px] flex-shrink-0 border-none';
                          dynamicTextClass = 'text-sm text-gray-900 font-medium';
                        }
                      } else {
                        // 3-up Logic
                        if (field.key === 'measurements') {
                          dynamicHeightClass = 'min-h-0 border-b-0 flex-1'; // Fill remaining vertical space (was description's role)
                        } else {
                          dynamicHeightClass = `${field.heightClass} flex-shrink-0`;
                        }
                      }

                      return (
                        <InfoRow
                          key={field.id}
                          label={txt[field.labelKey as keyof typeof txt] as string}
                          value={val}
                          className={dynamicHeightClass}
                          onChange={(v) => field.key !== 'date' && onUpdatePhoto(record.fileName, field.key as keyof AIAnalysisResult, v)}
                          readOnly={field.readOnly}
                          multiline={field.multiline}
                          hideLabel={isTwoUp} // Hide label in 2-up mode
                          align={isTwoUp ? 'center' : 'left'} // Center text in 2-up mode
                          textClass={dynamicTextClass}
                        >
                          {extraUI}
                        </InfoRow>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Custom Context Menu using Portal to escape CSS Transforms */}
      {contextMenu && createPortal(
        <div
          className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[150px] animate-in fade-in zoom-in duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-gray-100 text-xs text-gray-500 font-bold bg-gray-50">
            {lang === 'ja' ? '操作' : 'Action'}
          </div>
          <button
            onClick={() => {
              if (contextMenu && onReanalyzePhoto) {
                onReanalyzePhoto(contextMenu.targetFileName);
                setContextMenu(null);
              }
            }}
            className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
          >
            <Wand2 className="w-4 h-4" />
            {lang === 'ja' ? 'この画像を再解析' : 'Re-analyze Photo'}
          </button>
          <button
            onClick={executeShowReasoning}
            className="w-full text-left px-4 py-2 text-sm text-purple-600 hover:bg-purple-50 flex items-center gap-2"
          >
            <Brain className="w-4 h-4" />
            {txt.showReasoning}
          </button>
          <button
            onClick={executeSaveAsExample}
            disabled={isSavingExample}
            className="w-full text-left px-4 py-2 text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2 disabled:opacity-50"
          >
            <Star className="w-4 h-4" />
            {lang === 'ja' ? 'お手本として保存' : 'Save as Example'}
          </button>
          <button
            onClick={executeDelete}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            {lang === 'ja' ? '削除する' : 'Delete Photo'}
          </button>
        </div>,
        document.body
      )}

      {/* Reasoning Modal */}
      {reasoningModal && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50"
          onClick={() => setReasoningModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Brain className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{txt.reasoningTitle}</h3>
                  <p className="text-sm text-gray-500">{reasoningModal.fileName}</p>
                </div>
              </div>
              <button
                onClick={() => setReasoningModal(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Analysis Summary */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {reasoningModal.analysis.workType && (
                  <div><span className="text-gray-500">{txt.labelWorkType}:</span> <span className="font-medium">{reasoningModal.analysis.workType}</span></div>
                )}
                {reasoningModal.analysis.variety && (
                  <div><span className="text-gray-500">{txt.labelVariety}:</span> <span className="font-medium">{reasoningModal.analysis.variety}</span></div>
                )}
                {reasoningModal.analysis.detail && (
                  <div><span className="text-gray-500">{txt.labelDetail}:</span> <span className="font-medium">{reasoningModal.analysis.detail}</span></div>
                )}
                {reasoningModal.analysis.remarks && (
                  <div><span className="text-gray-500">{txt.labelRemarks}:</span> <span className="font-medium">{reasoningModal.analysis.remarks}</span></div>
                )}
                {reasoningModal.analysis.measurements && (
                  <div><span className="text-gray-500">{txt.labelMeasurements}:</span> <span className="font-medium">{reasoningModal.analysis.measurements}</span></div>
                )}
                {reasoningModal.analysis.station && (
                  <div><span className="text-gray-500">{txt.labelStation}:</span> <span className="font-medium">{reasoningModal.analysis.station}</span></div>
                )}
              </div>
            </div>

            {/* Reasoning Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* AI Reasoning */}
              {reasoningModal.reasoning ? (
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-gray-700 leading-relaxed bg-gradient-to-br from-purple-50/50 to-indigo-50/50 p-4 rounded-lg border border-purple-100">
                    {reasoningModal.reasoning}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <div className="p-3 bg-gray-100 rounded-full w-fit mx-auto mb-3">
                    <Brain className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-sm">{txt.noReasoning}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {lang === 'ja'
                      ? '再解析を行うと判断根拠が記録されます'
                      : 'Re-analyze the photo to record AI reasoning'}
                  </p>
                </div>
              )}

              {/* Change History */}
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 bg-amber-100 rounded flex items-center justify-center text-amber-600 text-xs">📝</span>
                  {txt.changeLogTitle}
                </h4>
                {reasoningModal.analysis.changeLog && reasoningModal.analysis.changeLog.length > 0 ? (
                  <div className="space-y-2">
                    {reasoningModal.analysis.changeLog.map((change, idx) => {
                      const stageInfo = STAGE_LABELS[change.stage];
                      const fieldInfo = FIELD_LABELS[change.field] || { ja: change.field, en: change.field };
                      return (
                        <div key={idx} className="bg-gray-50 rounded-lg p-3 text-sm border border-gray-100">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${stageInfo.color}`}>
                              {lang === 'ja' ? stageInfo.ja : stageInfo.en}
                            </span>
                            <span className="font-medium text-gray-700">
                              {lang === 'ja' ? fieldInfo.ja : fieldInfo.en}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-500">{txt.changedFrom}:</span>
                            <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded line-through">
                              {change.before || '(空)'}
                            </span>
                            <span className="text-gray-400">→</span>
                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded font-medium">
                              {change.after || '(空)'}
                            </span>
                          </div>
                          {change.reason && (
                            <div className="text-xs text-gray-500 mt-1 italic">
                              {change.reason}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-400 text-sm bg-gray-50 rounded-lg">
                    {txt.noChanges}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setReasoningModal(null)}
                className="w-full py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors font-medium"
              >
                {txt.closeBtn}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default PhotoAlbumView;