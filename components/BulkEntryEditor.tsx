import React, { useState, useMemo, useEffect } from 'react';
import { X, Edit3, CheckCircle2, Image, ChevronDown, ChevronUp, History, Layers, BookOpen, Search } from 'lucide-react';
import { PhotoRecord, AIAnalysisResult } from '../types';
import { LAYOUT_FIELDS } from '../utils/layoutConfig';
import { useBulkEditorState } from '../hooks/useBulkEditorState';
import {
  loadMasterCsv,
  extractAllValidValuesSync,
  getVarietiesByWorkTypeSync,
  getDetailsByVarietySync,
  getRemarksByDetailSync
} from '../utils/masterCsvParser';

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
const MASTER_SELECTABLE_FIELDS = ['workType', 'variety', 'detail', 'remarks'] as const;

// 階層の親情報
interface HierarchyContext {
  workType?: string;
  variety?: string;
  detail?: string;
}

// マスタ選択コンポーネント
const MasterSelector: React.FC<{
  field: string;
  lang: 'en' | 'ja';
  onSelect: (value: string) => void;
  selectedValue: string;
  hierarchyContext: HierarchyContext;
  masterLoaded: boolean;
}> = ({ field, lang, onSelect, selectedValue, hierarchyContext, masterLoaded }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const masterValues = useMemo(() => {
    if (!masterLoaded) return [];

    const { workTypes, varieties, details, remarks } = extractAllValidValuesSync();

    switch (field) {
      case 'workType':
        return Array.from(workTypes).sort();

      case 'variety':
        // 工種が選択されていれば絞り込み
        if (hierarchyContext.workType) {
          const filtered = getVarietiesByWorkTypeSync(hierarchyContext.workType);
          return filtered.length > 0 ? filtered : Array.from(varieties).sort();
        }
        return Array.from(varieties).sort();

      case 'detail':
        // 工種・種別が選択されていれば絞り込み
        if (hierarchyContext.workType && hierarchyContext.variety) {
          const filtered = getDetailsByVarietySync(hierarchyContext.workType, hierarchyContext.variety);
          return filtered.length > 0 ? filtered : Array.from(details).sort();
        }
        return Array.from(details).sort();

      case 'remarks':
        // 工種・種別・細別が選択されていれば絞り込み
        if (hierarchyContext.workType && hierarchyContext.variety && hierarchyContext.detail) {
          const filtered = getRemarksByDetailSync(hierarchyContext.workType, hierarchyContext.variety, hierarchyContext.detail);
          return filtered.length > 0 ? filtered : Array.from(remarks).sort();
        }
        return Array.from(remarks).sort();

      default:
        return [];
    }
  }, [field, hierarchyContext, masterLoaded]);

  const filteredValues = useMemo(() => {
    if (!searchQuery) return masterValues;
    const query = searchQuery.toLowerCase();
    return masterValues.filter(v => v.toLowerCase().includes(query));
  }, [masterValues, searchQuery]);

  // 絞り込みヒントを表示
  const getFilterHint = (): string | null => {
    if (field === 'variety' && !hierarchyContext.workType) {
      return lang === 'ja' ? '💡 工種を選択すると絞り込まれます' : '💡 Select work type to filter';
    }
    if (field === 'detail' && (!hierarchyContext.workType || !hierarchyContext.variety)) {
      return lang === 'ja' ? '💡 工種・種別を選択すると絞り込まれます' : '💡 Select work type & variety to filter';
    }
    if (field === 'remarks' && (!hierarchyContext.workType || !hierarchyContext.variety || !hierarchyContext.detail)) {
      return lang === 'ja' ? '💡 工種・種別・細別を選択すると絞り込まれます' : '💡 Select hierarchy to filter';
    }
    return null;
  };

  const filterHint = getFilterHint();

  if (masterValues.length === 0) return null;

  return (
    <div className="space-y-2">
      {filterHint && (
        <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
          {filterHint}
        </div>
      )}
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

// --- Sub-components for BulkEntryEditor ---

const BulkEditorHeader: React.FC<{ lang: 'en' | 'ja'; onClose: () => void }> = ({ lang, onClose }) => (
  <div className="flex items-center justify-between p-4 border-b bg-slate-50 rounded-t-xl">
    <div className="flex items-center gap-2">
      <Layers className="w-5 h-5 text-blue-600" />
      <h2 className="text-lg font-bold text-gray-800">{lang === 'ja' ? '一括編集' : 'Bulk Edit'}</h2>
    </div>
    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
      <X className="w-5 h-5 text-gray-500" />
    </button>
  </div>
);

const FieldSelector: React.FC<{
  lang: 'en' | 'ja';
  selectedField: string;
  onChangeField: (field: FieldKey) => void;
}> = ({ lang, selectedField, onChangeField }) => (
  <div className="p-4 bg-gray-50 border-b">
    <label className="block text-xs font-medium text-gray-600 mb-2">
      {lang === 'ja' ? '編集する項目' : 'Field to Edit'}
    </label>
    <div className="flex flex-wrap gap-2">
      {EDITABLE_FIELDS.map(f => (
        <button
          key={f.key}
          onClick={() => onChangeField(f.key as FieldKey)}
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
);

const InputModeTabs: React.FC<{
  lang: 'en' | 'ja';
  inputMode: 'master' | 'free';
  setInputMode: (mode: 'master' | 'free') => void;
}> = ({ lang, inputMode, setInputMode }) => (
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
);

const FreeInputField: React.FC<{
  lang: 'en' | 'ja';
  isMultiline?: boolean;
  value: string;
  onChange: (v: string) => void;
  fieldHistory: string[];
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
}> = ({ lang, isMultiline, value, onChange, fieldHistory, showHistory, setShowHistory }) => (
  <div className="relative">
    {isMultiline ? (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={lang === 'ja' ? '値を入力...' : 'Enter value...'}
        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
        rows={3}
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={lang === 'ja' ? '値を入力...' : 'Enter value...'}
        className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    )}
    {fieldHistory.length > 0 && !isMultiline && (
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
      <HistoryDropdown
        lang={lang}
        history={fieldHistory}
        onSelect={(s) => { onChange(s); setShowHistory(false); }}
      />
    )}
  </div>
);

const HistoryDropdown: React.FC<{
  lang: 'en' | 'ja';
  history: string[];
  onSelect: (v: string) => void;
}> = ({ lang, history, onSelect }) => (
  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
    <div className="p-2 text-xs text-gray-500 border-b flex items-center gap-1">
      <History className="w-3 h-3" />
      {lang === 'ja' ? '最近使用した値' : 'Recent values'}
    </div>
    {history.map((s, i) => (
      <button
        key={`${s}-${i}`}
        type="button"
        onClick={() => onSelect(s)}
        className="w-full text-left px-3 py-2 hover:bg-blue-50 font-mono text-sm border-b last:border-b-0"
      >
        {s}
      </button>
    ))}
  </div>
);

const ExistingValueSelector: React.FC<{
  lang: 'en' | 'ja';
  valueStats: Array<{ value: string; count: number }>;
  onSelect: (v: string) => void;
}> = ({ lang, valueStats, onSelect }) => (
  <div className="mt-2">
    <div className="text-xs text-gray-500 mb-1">
      {lang === 'ja' ? '既存の値から選択:' : 'Use existing value:'}
    </div>
    <div className="flex flex-wrap gap-1">
      {valueStats.slice(0, 8).map(({ value, count }) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
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
);

const SelectionStatus: React.FC<{
  lang: 'en' | 'ja';
  selectedCount: number;
  onClear: () => void;
  onSelectAll: () => void;
}> = ({ lang, selectedCount, onClear, onSelectAll }) => (
  <div className="mt-3 flex justify-between items-center">
    <span className="text-sm text-blue-700">
      {selectedCount > 0
        ? `${selectedCount}${lang === 'ja' ? '枚選択中' : ' selected'}`
        : lang === 'ja' ? '選択なし' : 'None selected'}
    </span>
    <div className="flex gap-2">
      {selectedCount > 0 && (
        <button onClick={onClear} className="text-xs text-gray-600 hover:text-gray-800 underline">
          {lang === 'ja' ? '選択解除' : 'Clear'}
        </button>
      )}
      <button onClick={onSelectAll} className="text-xs text-blue-600 hover:text-blue-800 underline">
        {lang === 'ja' ? 'すべて選択' : 'Select all'}
      </button>
    </div>
  </div>
);

const PhotoGroupHeader: React.FC<{
  lang: 'en' | 'ja';
  groupKey: string;
  photoCount: number;
  allSelected: boolean;
  someSelected: boolean;
  isExpanded: boolean;
  onToggleSelection: () => void;
  onToggleExpand: () => void;
}> = ({ lang, groupKey, photoCount, allSelected, someSelected, isExpanded, onToggleSelection, onToggleExpand }) => (
  <div className={`flex items-center gap-2 p-3 cursor-pointer transition-colors ${
    allSelected ? 'bg-blue-100' : someSelected ? 'bg-blue-50' : 'bg-gray-50 hover:bg-gray-100'
  }`}>
    <div
      onClick={onToggleSelection}
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
    <div className="flex-1" onClick={onToggleExpand}>
      <span className={`font-mono text-sm ${groupKey === '(空白)' ? 'text-gray-500 italic' : 'text-gray-800'}`}>
        {groupKey}
      </span>
      <span className="ml-2 text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
        {photoCount}{lang === 'ja' ? '枚' : ''}
      </span>
    </div>
    <button onClick={onToggleExpand} className="p-1 hover:bg-gray-200 rounded">
      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
    </button>
  </div>
);

const PhotoGroup: React.FC<{
  lang: 'en' | 'ja';
  groupKey: string;
  groupPhotos: PhotoRecord[];
  selectedPhotos: Set<string>;
  expandedGroups: Set<string>;
  selectedField: string;
  onToggleGroupSelection: (groupKey: string, photos: PhotoRecord[]) => void;
  onToggleGroup: (groupKey: string) => void;
  onTogglePhoto: (fileName: string) => void;
}> = ({ lang, groupKey, groupPhotos, selectedPhotos, expandedGroups, selectedField, onToggleGroupSelection, onToggleGroup, onTogglePhoto }) => {
  const isExpanded = expandedGroups.has(groupKey);
  const allSelected = groupPhotos.every(p => selectedPhotos.has(p.fileName));
  const someSelected = groupPhotos.some(p => selectedPhotos.has(p.fileName));

  return (
    <div className="border rounded-lg overflow-hidden">
      <PhotoGroupHeader
        lang={lang}
        groupKey={groupKey}
        photoCount={groupPhotos.length}
        allSelected={allSelected}
        someSelected={someSelected}
        isExpanded={isExpanded}
        onToggleSelection={() => onToggleGroupSelection(groupKey, groupPhotos)}
        onToggleExpand={() => onToggleGroup(groupKey)}
      />
      {isExpanded && (
        <div className="p-2 bg-white border-t space-y-1">
          {groupPhotos.map(photo => (
            <PhotoSelectItem
              key={photo.fileName}
              photo={photo}
              isSelected={selectedPhotos.has(photo.fileName)}
              onClick={() => onTogglePhoto(photo.fileName)}
              currentField={selectedField}
              lang={lang}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const BulkEditorFooter: React.FC<{
  lang: 'en' | 'ja';
  selectedCount: number;
  newValue: string;
  canApply: boolean;
  onClose: () => void;
  onApply: () => void;
}> = ({ lang, selectedCount, newValue, canApply, onClose, onApply }) => (
  <div className="p-4 border-t bg-gray-50 rounded-b-xl flex items-center justify-between">
    <div className="text-sm text-gray-600">
      {selectedCount > 0 && newValue && (
        <span className="text-blue-600 font-medium">
          {selectedCount}{lang === 'ja' ? '枚を更新予定' : ' photos will be updated'}
          <span className="ml-2 font-mono bg-green-100 text-green-700 px-1 rounded">→ {newValue}</span>
        </span>
      )}
    </div>
    <div className="flex gap-2">
      <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
        {lang === 'ja' ? 'キャンセル' : 'Cancel'}
      </button>
      <button
        onClick={onApply}
        disabled={!canApply}
        className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
          canApply ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        <Edit3 className="w-4 h-4" />
        {lang === 'ja' ? '適用' : 'Apply'}
      </button>
    </div>
  </div>
);

// --- Main Component ---

const BulkEntryEditor: React.FC<BulkEntryEditorProps> = ({ photos, lang, onClose, onApply }) => {
  const state = useBulkEditorState(photos);
  const [inputMode, setInputMode] = useState<'master' | 'free'>('master');
  const [masterLoaded, setMasterLoaded] = useState(false);
  const fieldLabel = FIELD_LABELS[state.selectedField]?.[lang] || state.selectedField;
  const isMultiline = EDITABLE_FIELDS.find(f => f.key === state.selectedField)?.multiline;
  const isMasterSelectable = (MASTER_SELECTABLE_FIELDS as readonly string[]).includes(state.selectedField);

  // CSV マスタをプリロード
  useEffect(() => {
    loadMasterCsv().then(() => setMasterLoaded(true));
  }, []);

  // 選択された写真から共通の階層情報を取得
  const hierarchyContext = useMemo((): HierarchyContext => {
    const selectedPhotos = photos.filter(p => state.selectedPhotos.has(p.fileName));
    if (selectedPhotos.length === 0) return {};

    // 選択された写真の工種・種別・細別を収集
    const workTypes = new Set<string>();
    const varieties = new Set<string>();
    const details = new Set<string>();

    selectedPhotos.forEach(p => {
      if (p.analysis?.workType) workTypes.add(p.analysis.workType);
      if (p.analysis?.variety) varieties.add(p.analysis.variety);
      if (p.analysis?.detail) details.add(p.analysis.detail);
    });

    // 共通の値がある場合のみコンテキストに設定
    return {
      workType: workTypes.size === 1 ? Array.from(workTypes)[0] : undefined,
      variety: varieties.size === 1 ? Array.from(varieties)[0] : undefined,
      detail: details.size === 1 ? Array.from(details)[0] : undefined,
    };
  }, [photos, state.selectedPhotos]);

  const handleApply = () => {
    const updates = state.buildUpdates();
    if (updates.length > 0) {
      onApply(updates);
      onClose();
    }
  };

  const renderMasterInput = () => (
    <div className="space-y-2">
      {/* 階層コンテキスト表示 */}
      {(hierarchyContext.workType || hierarchyContext.variety || hierarchyContext.detail) && (
        <div className="text-xs bg-blue-50 border border-blue-200 rounded-lg p-2">
          <span className="text-blue-700 font-medium">{lang === 'ja' ? '絞り込み条件: ' : 'Filter: '}</span>
          {hierarchyContext.workType && <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded mr-1">{hierarchyContext.workType}</span>}
          {hierarchyContext.variety && <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded mr-1">{hierarchyContext.variety}</span>}
          {hierarchyContext.detail && <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">{hierarchyContext.detail}</span>}
        </div>
      )}
      <MasterSelector
        field={state.selectedField}
        lang={lang}
        onSelect={(value) => state.setNewValue(value)}
        selectedValue={state.newValue}
        hierarchyContext={hierarchyContext}
        masterLoaded={masterLoaded}
      />
      {state.newValue && (
        <div className="p-2 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-xs text-green-700">{lang === 'ja' ? '選択中: ' : 'Selected: '}</span>
          <span className="font-mono text-sm text-green-800">{state.newValue}</span>
        </div>
      )}
    </div>
  );

  const renderPhotoList = () => {
    if (photos.length === 0) {
      return (
        <div className="text-center text-gray-500 py-8">
          {lang === 'ja' ? '写真データがありません' : 'No photo data'}
        </div>
      );
    }

    if (state.viewMode === 'grouped') {
      return (
        <div className="space-y-3">
          {state.groupedPhotos.map(([groupKey, groupPhotos]) => (
            <PhotoGroup
              key={groupKey}
              lang={lang}
              groupKey={groupKey}
              groupPhotos={groupPhotos}
              selectedPhotos={state.selectedPhotos}
              expandedGroups={state.expandedGroups}
              selectedField={state.selectedField}
              onToggleGroupSelection={state.toggleGroupSelection}
              onToggleGroup={state.toggleGroup}
              onTogglePhoto={state.togglePhoto}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {photos.map(photo => (
          <PhotoSelectItem
            key={photo.fileName}
            photo={photo}
            isSelected={state.selectedPhotos.has(photo.fileName)}
            onClick={() => state.togglePhoto(photo.fileName)}
            currentField={state.selectedField}
            lang={lang}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <BulkEditorHeader lang={lang} onClose={onClose} />

        <FieldSelector
          lang={lang}
          selectedField={state.selectedField}
          onChangeField={state.changeField}
        />

        <div className="p-4 bg-blue-50 border-b">
          {isMasterSelectable && (
            <InputModeTabs lang={lang} inputMode={inputMode} setInputMode={setInputMode} />
          )}

          <label className="block text-xs font-medium text-gray-600 mb-1">
            {inputMode === 'master' && isMasterSelectable ? (
              <><BookOpen className="w-3 h-3 inline mr-1" />{lang === 'ja' ? `${fieldLabel}を選択` : `Select ${fieldLabel}`}</>
            ) : (
              <><Edit3 className="w-3 h-3 inline mr-1" />{lang === 'ja' ? `新しい${fieldLabel}` : `New ${fieldLabel}`}</>
            )}
          </label>

          {isMasterSelectable && inputMode === 'master' ? (
            renderMasterInput()
          ) : (
            <FreeInputField
              lang={lang}
              isMultiline={isMultiline}
              value={state.newValue}
              onChange={state.setNewValue}
              fieldHistory={state.fieldHistory}
              showHistory={state.showHistory}
              setShowHistory={state.setShowHistory}
            />
          )}

          {(!isMasterSelectable || inputMode === 'free') && state.valueStats.length > 0 && (
            <ExistingValueSelector
              lang={lang}
              valueStats={state.valueStats}
              onSelect={state.useExistingValue}
            />
          )}

          <SelectionStatus
            lang={lang}
            selectedCount={state.selectedPhotos.size}
            onClear={state.clearSelection}
            onSelectAll={state.selectAll}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {renderPhotoList()}
        </div>

        <BulkEditorFooter
          lang={lang}
          selectedCount={state.selectedPhotos.size}
          newValue={state.newValue}
          canApply={state.canApply}
          onClose={onClose}
          onApply={handleApply}
        />
      </div>
    </div>
  );
};

export default BulkEntryEditor;
