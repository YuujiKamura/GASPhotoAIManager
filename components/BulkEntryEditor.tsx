import React, { useState, useMemo } from 'react';
import { X, Edit3, CheckCircle2, Image, ChevronDown, ChevronUp, History, Layers, BookOpen, Search } from 'lucide-react';
import { PhotoRecord, AIAnalysisResult } from '../types';
import { LAYOUT_FIELDS } from '../utils/layoutConfig';
import { useBulkEditorState } from '../hooks/useBulkEditorState';
import { extractAllValidValues } from '../utils/constructionMaster';

const EDITABLE_FIELDS = LAYOUT_FIELDS.filter(f => !f.readOnly);
type FieldKey = keyof AIAnalysisResult;

interface BulkEntryEditorProps {
  photos: PhotoRecord[];
  lang: 'en' | 'ja';
  onClose: () => void;
  onApply: (updates: Array<{ fileName: string; field: FieldKey; value: string }>) => void;
}

const FIELD_LABELS: Record<string, { ja: string; en: string }> = {
  workType: { ja: '工種', en: 'Work Type' },
  variety: { ja: '種別', en: 'Variety' },
  detail: { ja: '細別', en: 'Detail' },
  station: { ja: '測点', en: 'Station' },
  remarks: { ja: '備考', en: 'Remarks' },
  measurements: { ja: '測定値', en: 'Measurements' },
};

// マスタから選択可能なフィールド
const MASTER_SELECTABLE_FIELDS = ['workType', 'variety', 'detail'] as const;

// マスタ選択コンポーネント
const MasterSelector: React.FC<{
  field: string;
  lang: 'en' | 'ja';
  onSelect: (value: string) => void;
  selectedValue: string;
}> = ({ field, lang, onSelect, selectedValue }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const masterValues = useMemo(() => {
    const { workTypes, varieties, details } = extractAllValidValues();
    switch (field) {
      case 'workType':
        return Array.from(workTypes).sort();
      case 'variety':
        return Array.from(varieties).sort();
      case 'detail':
        return Array.from(details).sort();
      default:
        return [];
    }
  }, [field]);

  const filteredValues = useMemo(() => {
    if (!searchQuery) return masterValues;
    const query = searchQuery.toLowerCase();
    return masterValues.filter(v => v.toLowerCase().includes(query));
  }, [masterValues, searchQuery]);

  if (masterValues.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={lang === 'ja' ? 'マスタを検索...' : 'Search master...'}
          className="w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
      </div>
      <div className="max-h-40 overflow-y-auto border rounded-lg bg-white">
        {filteredValues.length === 0 ? (
          <div className="p-3 text-center text-gray-500 text-sm">
            {lang === 'ja' ? '一致する項目がありません' : 'No matching items'}
          </div>
        ) : (
          <div className="p-2 flex flex-wrap gap-1">
            {filteredValues.map(value => (
              <button
                key={value}
                type="button"
                onClick={() => onSelect(value)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  selectedValue === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 hover:bg-blue-100 text-gray-700'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500">
        {lang === 'ja'
          ? `${filteredValues.length}件 / 全${masterValues.length}件`
          : `${filteredValues.length} / ${masterValues.length} items`}
      </div>
    </div>
  );
};

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
        isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
        {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
      </div>
      <div className="w-12 h-9 bg-gray-200 rounded overflow-hidden flex-shrink-0">
        {photo.dataUrl ? <img src={photo.dataUrl} alt={photo.fileName} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Image className="w-4 h-4 text-gray-400" /></div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 truncate">{photo.fileName}</div>
        <div className="text-sm truncate font-mono">{currentValue || <span className="text-gray-400 italic">{lang === 'ja' ? '(空白)' : '(empty)'}</span>}</div>
      </div>
    </div>
  );
};

const BulkEntryEditor: React.FC<BulkEntryEditorProps> = ({ photos, lang, onClose, onApply }) => {
  const state = useBulkEditorState(photos);
  const [inputMode, setInputMode] = useState<'master' | 'free'>('master');
  const fieldLabel = FIELD_LABELS[state.selectedField]?.[lang] || state.selectedField;
  const isMultiline = EDITABLE_FIELDS.find(f => f.key === state.selectedField)?.multiline;
  const isMasterSelectable = (MASTER_SELECTABLE_FIELDS as readonly string[]).includes(state.selectedField);

  const handleApply = () => {
    const updates = state.buildUpdates();
    if (updates.length > 0) {
      onApply(updates);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">{lang === 'ja' ? '一括編集' : 'Bulk Edit'}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {/* Field Selector */}
        <div className="p-4 bg-gray-50 border-b">
          <label className="block text-xs font-medium text-gray-600 mb-2">{lang === 'ja' ? '編集する項目' : 'Field to Edit'}</label>
          <div className="flex flex-wrap gap-2">
            {EDITABLE_FIELDS.map(f => (
              <button
                key={f.key}
                onClick={() => state.changeField(f.key as FieldKey)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  state.selectedField === f.key ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {FIELD_LABELS[f.key]?.[lang] || f.key}
              </button>
            ))}
          </div>
        </div>

        {/* New Value Input */}
        <div className="p-4 bg-blue-50 border-b">
          {/* Input Mode Tabs - マスタ選択可能なフィールドのみ表示 */}
          {isMasterSelectable && (
            <div className="flex gap-1 mb-3">
              <button
                onClick={() => setInputMode('master')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  inputMode === 'master'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                {lang === 'ja' ? 'マスタから選択' : 'Select from Master'}
              </button>
              <button
                onClick={() => setInputMode('free')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  inputMode === 'free'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                {lang === 'ja' ? '自由入力' : 'Free Input'}
              </button>
            </div>
          )}

          <label className="block text-xs font-medium text-gray-600 mb-1">
            {inputMode === 'master' && isMasterSelectable ? (
              <><BookOpen className="w-3 h-3 inline mr-1" />{lang === 'ja' ? `${fieldLabel}を選択` : `Select ${fieldLabel}`}</>
            ) : (
              <><Edit3 className="w-3 h-3 inline mr-1" />{lang === 'ja' ? `新しい${fieldLabel}` : `New ${fieldLabel}`}</>
            )}
          </label>

          {/* Master Selector Mode */}
          {isMasterSelectable && inputMode === 'master' ? (
            <div className="space-y-2">
              <MasterSelector
                field={state.selectedField}
                lang={lang}
                onSelect={(value) => state.setNewValue(value)}
                selectedValue={state.newValue}
              />
              {state.newValue && (
                <div className="p-2 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-xs text-green-700">
                    {lang === 'ja' ? '選択中: ' : 'Selected: '}
                  </span>
                  <span className="font-mono text-sm text-green-800">{state.newValue}</span>
                </div>
              )}
            </div>
          ) : (
            /* Free Input Mode */
            <div className="relative">
              {isMultiline ? (
                <textarea value={state.newValue} onChange={e => state.setNewValue(e.target.value)} placeholder={lang === 'ja' ? '値を入力...' : 'Enter value...'} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" rows={3} />
              ) : (
                <input type="text" value={state.newValue} onChange={e => state.setNewValue(e.target.value)} placeholder={lang === 'ja' ? '値を入力...' : 'Enter value...'} className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              )}
              {state.fieldHistory.length > 0 && !isMultiline && (
                <button type="button" onClick={() => state.setShowHistory(!state.showHistory)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded" title={lang === 'ja' ? '履歴から選択' : 'Select from history'}>
                  <History className="w-4 h-4 text-gray-500" />
                </button>
              )}
              {state.showHistory && state.fieldHistory.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <div className="p-2 text-xs text-gray-500 border-b flex items-center gap-1"><History className="w-3 h-3" />{lang === 'ja' ? '最近使用した値' : 'Recent values'}</div>
                  {state.fieldHistory.map((s, i) => (
                    <button key={i} type="button" onClick={() => { state.setNewValue(s); state.setShowHistory(false); }} className="w-full text-left px-3 py-2 hover:bg-blue-50 font-mono text-sm border-b last:border-b-0">{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 既存の値から選択 - 自由入力モードまたは非マスタフィールドで表示 */}
          {(!isMasterSelectable || inputMode === 'free') && state.valueStats.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-gray-500 mb-1">{lang === 'ja' ? '既存の値から選択:' : 'Use existing value:'}</div>
              <div className="flex flex-wrap gap-1">
                {state.valueStats.slice(0, 8).map(({ value, count }) => (
                  <button key={value} type="button" onClick={() => state.useExistingValue(value)} className={`text-xs px-2 py-1 rounded ${value ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-gray-200 hover:bg-gray-300 text-gray-500 italic'}`}>
                    {value || '(空白)'} ({count})
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex justify-between items-center">
            <span className="text-sm text-blue-700">{state.selectedPhotos.size > 0 ? `${state.selectedPhotos.size}${lang === 'ja' ? '枚選択中' : ' selected'}` : lang === 'ja' ? '選択なし' : 'None selected'}</span>
            <div className="flex gap-2">
              {state.selectedPhotos.size > 0 && <button onClick={state.clearSelection} className="text-xs text-gray-600 hover:text-gray-800 underline">{lang === 'ja' ? '選択解除' : 'Clear'}</button>}
              <button onClick={state.selectAll} className="text-xs text-blue-600 hover:text-blue-800 underline">{lang === 'ja' ? 'すべて選択' : 'Select all'}</button>
            </div>
          </div>
        </div>

        {/* Photo List */}
        <div className="flex-1 overflow-y-auto p-4">
          {photos.length === 0 ? (
            <div className="text-center text-gray-500 py-8">{lang === 'ja' ? '写真データがありません' : 'No photo data'}</div>
          ) : state.viewMode === 'grouped' ? (
            <div className="space-y-3">
              {state.groupedPhotos.map(([groupKey, groupPhotos]) => {
                const isExpanded = state.expandedGroups.has(groupKey);
                const allSelected = groupPhotos.every(p => state.selectedPhotos.has(p.fileName));
                const someSelected = groupPhotos.some(p => state.selectedPhotos.has(p.fileName));
                return (
                  <div key={groupKey} className="border rounded-lg overflow-hidden">
                    <div className={`flex items-center gap-2 p-3 cursor-pointer transition-colors ${allSelected ? 'bg-blue-100' : someSelected ? 'bg-blue-50' : 'bg-gray-50 hover:bg-gray-100'}`}>
                      <div onClick={() => state.toggleGroupSelection(groupKey, groupPhotos)} className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 cursor-pointer ${allSelected ? 'bg-blue-500 border-blue-500' : someSelected ? 'bg-blue-200 border-blue-300' : 'border-gray-300 hover:border-blue-400'}`}>
                        {allSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                        {someSelected && !allSelected && <div className="w-2 h-2 bg-blue-500 rounded" />}
                      </div>
                      <div className="flex-1" onClick={() => state.toggleGroup(groupKey)}>
                        <span className={`font-mono text-sm ${groupKey === '(空白)' ? 'text-gray-500 italic' : 'text-gray-800'}`}>{groupKey}</span>
                        <span className="ml-2 text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{groupPhotos.length}{lang === 'ja' ? '枚' : ''}</span>
                      </div>
                      <button onClick={() => state.toggleGroup(groupKey)} className="p-1 hover:bg-gray-200 rounded">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="p-2 bg-white border-t space-y-1">
                        {groupPhotos.map(photo => <PhotoSelectItem key={photo.fileName} photo={photo} isSelected={state.selectedPhotos.has(photo.fileName)} onClick={() => state.togglePhoto(photo.fileName)} currentField={state.selectedField} lang={lang} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1">
              {photos.map(photo => <PhotoSelectItem key={photo.fileName} photo={photo} isSelected={state.selectedPhotos.has(photo.fileName)} onClick={() => state.togglePhoto(photo.fileName)} currentField={state.selectedField} lang={lang} />)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {state.selectedPhotos.size > 0 && state.newValue && (
              <span className="text-blue-600 font-medium">{state.selectedPhotos.size}{lang === 'ja' ? '枚を更新予定' : ' photos will be updated'}<span className="ml-2 font-mono bg-green-100 text-green-700 px-1 rounded">→ {state.newValue}</span></span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">{lang === 'ja' ? 'キャンセル' : 'Cancel'}</button>
            <button onClick={handleApply} disabled={!state.canApply} className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${state.canApply ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
              <Edit3 className="w-4 h-4" />{lang === 'ja' ? '適用' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkEntryEditor;
