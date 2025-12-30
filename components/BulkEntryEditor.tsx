import React, { useState, useMemo, useEffect } from 'react';
import { X, Edit3, CheckCircle2, Image, ChevronDown, ChevronUp, History, Layers } from 'lucide-react';
import { PhotoRecord, AIAnalysisResult } from '../types';
import { LAYOUT_FIELDS } from '../utils/layoutConfig';
import { getWorkTypeHistory, addWorkTypeToHistory, getStationHistory, addStationToHistory } from '../utils/storage';

// 編集可能なフィールド（日付以外）
const EDITABLE_FIELDS = LAYOUT_FIELDS.filter(f => !f.readOnly);

type FieldKey = keyof AIAnalysisResult;

interface BulkEntryEditorProps {
  photos: PhotoRecord[];
  lang: 'en' | 'ja';
  onClose: () => void;
  onApply: (updates: Array<{ fileName: string; field: FieldKey; value: string }>) => void;
}

// フィールドのラベル
const FIELD_LABELS: Record<string, { ja: string; en: string }> = {
  workType: { ja: '工種', en: 'Work Type' },
  variety: { ja: '種別', en: 'Variety' },
  detail: { ja: '細別', en: 'Detail' },
  station: { ja: '測点', en: 'Station' },
  remarks: { ja: '備考', en: 'Remarks' },
  measurements: { ja: '測定値', en: 'Measurements' },
};

// 写真選択アイテム
const PhotoSelectItem: React.FC<{
  photo: PhotoRecord;
  isSelected: boolean;
  onClick: () => void;
  currentField: string;
  lang: 'en' | 'ja';
}> = ({ photo, isSelected, onClick, currentField, lang }) => {
  const currentValue = photo.analysis?.[currentField as keyof AIAnalysisResult] as string || '';

  return (
    <div
      onClick={onClick}
      className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center gap-2 ${
        isSelected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div
        className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
          isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
        }`}
      >
        {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
      </div>
      <div className="w-12 h-9 bg-gray-200 rounded overflow-hidden flex-shrink-0">
        {photo.dataUrl ? (
          <img
            src={photo.dataUrl}
            alt={photo.fileName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="w-4 h-4 text-gray-400" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 truncate">{photo.fileName}</div>
        <div className="text-sm truncate font-mono">
          {currentValue || <span className="text-gray-400 italic">{lang === 'ja' ? '(空白)' : '(empty)'}</span>}
        </div>
      </div>
    </div>
  );
};

// 値の統計を計算するユーティリティ
const getValueStats = (photos: PhotoRecord[], field: string) => {
  const stats = new Map<string, number>();
  photos.forEach(p => {
    const val = (p.analysis?.[field as keyof AIAnalysisResult] as string) || '';
    stats.set(val, (stats.get(val) || 0) + 1);
  });
  return Array.from(stats.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
};

const BulkEntryEditor: React.FC<BulkEntryEditorProps> = ({ photos, lang, onClose, onApply }) => {
  const [selectedField, setSelectedField] = useState<FieldKey>('workType');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [newValue, setNewValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('grouped');

  // フィールド別の履歴
  const [fieldHistory, setFieldHistory] = useState<string[]>([]);

  useEffect(() => {
    if (selectedField === 'station') {
      setFieldHistory(getStationHistory());
    } else if (selectedField === 'workType') {
      setFieldHistory(getWorkTypeHistory());
    } else {
      setFieldHistory([]);
    }
  }, [selectedField]);

  // 選択フィールドの現在値でグループ化
  const groupedPhotos = useMemo(() => {
    const groups = new Map<string, PhotoRecord[]>();
    photos.forEach(p => {
      const val = (p.analysis?.[selectedField as keyof AIAnalysisResult] as string) || '';
      const key = val || '(空白)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    });
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === '(空白)') return 1;
      if (b[0] === '(空白)') return -1;
      return b[1].length - a[1].length;
    });
  }, [photos, selectedField]);

  // 値の統計
  const valueStats = useMemo(() => getValueStats(photos, selectedField), [photos, selectedField]);

  // グループを展開/折りたたみ
  const toggleGroup = (groupKey: string) => {
    const newSet = new Set(expandedGroups);
    if (newSet.has(groupKey)) {
      newSet.delete(groupKey);
    } else {
      newSet.add(groupKey);
    }
    setExpandedGroups(newSet);
  };

  // グループ内の全写真を選択/解除
  const toggleGroupSelection = (groupKey: string, groupPhotos: PhotoRecord[]) => {
    const newSet = new Set(selectedPhotos);
    const allSelected = groupPhotos.every(p => newSet.has(p.fileName));
    if (allSelected) {
      groupPhotos.forEach(p => newSet.delete(p.fileName));
    } else {
      groupPhotos.forEach(p => newSet.add(p.fileName));
    }
    setSelectedPhotos(newSet);
  };

  // 単一写真の選択を切り替え
  const togglePhoto = (fileName: string) => {
    const newSet = new Set(selectedPhotos);
    if (newSet.has(fileName)) {
      newSet.delete(fileName);
    } else {
      newSet.add(fileName);
    }
    setSelectedPhotos(newSet);
  };

  // 適用
  const handleApply = () => {
    if (selectedPhotos.size === 0 || !newValue) return;

    const updates: Array<{ fileName: string; field: FieldKey; value: string }> = [];
    selectedPhotos.forEach(fileName => {
      updates.push({ fileName, field: selectedField, value: newValue });
    });

    // 履歴に追加
    if (selectedField === 'station' && newValue) {
      addStationToHistory(newValue);
    } else if (selectedField === 'workType' && newValue) {
      addWorkTypeToHistory(newValue);
    }

    onApply(updates);
    onClose();
  };

  // すべて選択
  const selectAll = () => {
    setSelectedPhotos(new Set(photos.map(p => p.fileName)));
  };

  // 選択解除
  const clearSelection = () => {
    setSelectedPhotos(new Set());
  };

  // 既存の値をクリックで入力
  const useExistingValue = (value: string) => {
    setNewValue(value === '(空白)' ? '' : value);
  };

  const canApply = selectedPhotos.size > 0 && newValue;
  const fieldLabel = FIELD_LABELS[selectedField]?.[lang] || selectedField;

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">
              {lang === 'ja' ? '一括編集' : 'Bulk Edit'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Field Selector */}
        <div className="p-4 bg-gray-50 border-b">
          <label className="block text-xs font-medium text-gray-600 mb-2">
            {lang === 'ja' ? '編集する項目' : 'Field to Edit'}
          </label>
          <div className="flex flex-wrap gap-2">
            {EDITABLE_FIELDS.map(f => (
              <button
                key={f.key}
                onClick={() => {
                  setSelectedField(f.key as FieldKey);
                  setSelectedPhotos(new Set());
                  setNewValue('');
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedField === f.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {FIELD_LABELS[f.key]?.[lang] || f.key}
              </button>
            ))}
          </div>
        </div>

        {/* New Value Input */}
        <div className="p-4 bg-blue-50 border-b">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            <Edit3 className="w-3 h-3 inline mr-1" />
            {lang === 'ja' ? `新しい${fieldLabel}` : `New ${fieldLabel}`}
          </label>
          <div className="relative">
            {EDITABLE_FIELDS.find(f => f.key === selectedField)?.multiline ? (
              <textarea
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                placeholder={lang === 'ja' ? '値を入力...' : 'Enter value...'}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                rows={3}
              />
            ) : (
              <input
                type="text"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                placeholder={lang === 'ja' ? '値を入力...' : 'Enter value...'}
                className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            )}
            {fieldHistory.length > 0 && !EDITABLE_FIELDS.find(f => f.key === selectedField)?.multiline && (
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded"
                title={lang === 'ja' ? '履歴から選択' : 'Select from history'}
              >
                <History className="w-4 h-4 text-gray-500" />
              </button>
            )}
            {showHistory && fieldHistory.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                <div className="p-2 text-xs text-gray-500 border-b flex items-center gap-1">
                  <History className="w-3 h-3" />
                  {lang === 'ja' ? '最近使用した値' : 'Recent values'}
                </div>
                {fieldHistory.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setNewValue(s);
                      setShowHistory(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 font-mono text-sm border-b last:border-b-0"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 既存の値から選択 */}
          {valueStats.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-gray-500 mb-1">
                {lang === 'ja' ? '既存の値から選択:' : 'Use existing value:'}
              </div>
              <div className="flex flex-wrap gap-1">
                {valueStats.slice(0, 8).map(({ value, count }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => useExistingValue(value)}
                    className={`text-xs px-2 py-1 rounded ${
                      value
                        ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-500 italic'
                    }`}
                  >
                    {value || '(空白)'} ({count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 選択状況 */}
          <div className="mt-3 flex justify-between items-center">
            <span className="text-sm text-blue-700">
              {selectedPhotos.size > 0
                ? `${selectedPhotos.size}${lang === 'ja' ? '枚選択中' : ' selected'}`
                : lang === 'ja'
                  ? '選択なし'
                  : 'None selected'}
            </span>
            <div className="flex gap-2">
              {selectedPhotos.size > 0 && (
                <button onClick={clearSelection} className="text-xs text-gray-600 hover:text-gray-800 underline">
                  {lang === 'ja' ? '選択解除' : 'Clear'}
                </button>
              )}
              <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800 underline">
                {lang === 'ja' ? 'すべて選択' : 'Select all'}
              </button>
            </div>
          </div>
        </div>

        {/* Photo List */}
        <div className="flex-1 overflow-y-auto p-4">
          {photos.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {lang === 'ja' ? '写真データがありません' : 'No photo data'}
            </div>
          ) : viewMode === 'grouped' ? (
            <div className="space-y-3">
              {groupedPhotos.map(([groupKey, groupPhotos]) => {
                const isExpanded = expandedGroups.has(groupKey);
                const allSelected = groupPhotos.every(p => selectedPhotos.has(p.fileName));
                const someSelected = groupPhotos.some(p => selectedPhotos.has(p.fileName));

                return (
                  <div key={groupKey} className="border rounded-lg overflow-hidden">
                    {/* Group Header */}
                    <div
                      className={`flex items-center gap-2 p-3 cursor-pointer transition-colors ${
                        allSelected
                          ? 'bg-blue-100'
                          : someSelected
                            ? 'bg-blue-50'
                            : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div
                        onClick={() => toggleGroupSelection(groupKey, groupPhotos)}
                        className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 cursor-pointer ${
                          allSelected
                            ? 'bg-blue-500 border-blue-500'
                            : someSelected
                              ? 'bg-blue-200 border-blue-300'
                              : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {allSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                        {someSelected && !allSelected && <div className="w-2 h-2 bg-blue-500 rounded" />}
                      </div>
                      <div className="flex-1" onClick={() => toggleGroup(groupKey)}>
                        <span
                          className={`font-mono text-sm ${
                            groupKey === '(空白)' ? 'text-gray-500 italic' : 'text-gray-800'
                          }`}
                        >
                          {groupKey}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                          {groupPhotos.length}
                          {lang === 'ja' ? '枚' : ''}
                        </span>
                      </div>
                      <button onClick={() => toggleGroup(groupKey)} className="p-1 hover:bg-gray-200 rounded">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        )}
                      </button>
                    </div>

                    {/* Group Photos */}
                    {isExpanded && (
                      <div className="p-2 bg-white border-t space-y-1">
                        {groupPhotos.map(photo => (
                          <PhotoSelectItem
                            key={photo.fileName}
                            photo={photo}
                            isSelected={selectedPhotos.has(photo.fileName)}
                            onClick={() => togglePhoto(photo.fileName)}
                            currentField={selectedField}
                            lang={lang}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1">
              {photos.map(photo => (
                <PhotoSelectItem
                  key={photo.fileName}
                  photo={photo}
                  isSelected={selectedPhotos.has(photo.fileName)}
                  onClick={() => togglePhoto(photo.fileName)}
                  currentField={selectedField}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {selectedPhotos.size > 0 && newValue && (
              <span className="text-blue-600 font-medium">
                {selectedPhotos.size}
                {lang === 'ja' ? '枚を更新予定' : ' photos will be updated'}
                <span className="ml-2 font-mono bg-green-100 text-green-700 px-1 rounded">→ {newValue}</span>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
              {lang === 'ja' ? 'キャンセル' : 'Cancel'}
            </button>
            <button
              onClick={handleApply}
              disabled={!canApply}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                canApply
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              {lang === 'ja' ? '適用' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkEntryEditor;
