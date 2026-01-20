import React from 'react';
import { X } from 'lucide-react';
import { SortPolicy } from '../../types';
import { setSelectedModel } from '../../services/geminiService';
import { PhotoGrid, SettingsSection, ActionButtons, PreAnalysisInfoSection } from './SubComponents';
import { useAnalysisSetupState, PreAnalysisInfo } from './useAnalysisSetupState';

interface AnalysisActions {
  onCancel: () => void;
  onStartAnalysis: (files: File[], sortPolicy: SortPolicy, useCache: boolean, preInfo: PreAnalysisInfo) => void;
  onManualPairing?: (files: File[]) => void;
  onInteractiveTest: (file: File) => void;
  onOpenMasterEditor: () => void;
  onOpenSettings?: () => void;
}

interface Props {
  files: File[];
  lang: 'ja' | 'en';
  apiKey?: string;
  actions: AnalysisActions;
}

export interface AnalysisSetupModalProps extends Omit<Props, 'actions'>, AnalysisActions {}

const getTexts = (lang: 'ja' | 'en') => ({
  title: lang === 'ja' ? '解析設定' : 'Analysis Setup',
  selected: lang === 'ja' ? '選択' : 'Selected',
  cost: lang === 'ja' ? '推定コスト' : 'Est. Cost',
  model: lang === 'ja' ? 'モデル' : 'Model',
  sort: lang === 'ja' ? '並び替え' : 'Sort',
  cache: lang === 'ja' ? 'キャッシュ' : 'Cache',
  workTypes: lang === 'ja' ? '工種' : 'Work Types',
  all: lang === 'ja' ? '全選択' : 'All',
  none: lang === 'ja' ? '解除' : 'None',
  cancel: lang === 'ja' ? 'キャンセル' : 'Cancel',
  manual: lang === 'ja' ? '手動ペアリング' : 'Manual Pairing',
  start: lang === 'ja' ? '解析開始' : 'Start',
  clickToTest: lang === 'ja' ? 'クリックで対話型テスト' : 'Click for interactive test',
  noWorkTypes: lang === 'ja' ? '工種未設定' : 'No work types',
  clearCache: lang === 'ja' ? 'キャッシュ削除' : 'Clear Cache',
  workTypeLabel: lang === 'ja' ? '工種（必須）' : 'Work Type (Required)',
  workTypePlaceholder: lang === 'ja' ? '工種を選択...' : 'Select work type...',
  stationLabel: lang === 'ja' ? '測点（任意）' : 'Station (Optional)',
  stationPlaceholder: lang === 'ja' ? '例: No.5+10' : 'e.g. No.5+10',
});

const AnalysisSetupModalInner: React.FC<Props> = ({ files, lang, apiKey, actions }) => {
  const { onCancel, onStartAnalysis, onManualPairing, onInteractiveTest, onOpenMasterEditor, onOpenSettings } = actions;
  const state = useAnalysisSetupState(files);
  const txt = getTexts(lang);

  const handleStart = () => {
    if (state.selectedFiles.length === 0) return;
    if (!state.workType) return;
    if (!apiKey) {
      onOpenSettings?.();
      return;
    }
    setSelectedModel(state.model);
    onStartAnalysis(state.selectedFiles, state.sortPolicy, state.useCache, state.preInfo);
  };

  const handleInteractive = (file: File) => {
    setSelectedModel(state.model);
    onInteractiveTest(file);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-600 text-white rounded-t-xl">
          <span className="font-bold">{txt.title}</span>
          <button onClick={onCancel} className="p-1 hover:bg-white/20 rounded"><X className="w-5 h-5" /></button>
        </div>
        <PhotoGrid
          entries={state.entries}
          onToggle={state.toggleSelect}
          onInteractive={handleInteractive}
          onSelectAll={state.selectAll}
          onSelectNone={state.selectNone}
          onClearSelectedCache={state.clearSelectedCache}
          selectedCachedCount={state.selectedCachedCount}
          txt={{ clickToTest: txt.clickToTest, all: txt.all, none: txt.none, clearCache: txt.clearCache }}
        />
        <SettingsSection
          selectedCount={state.selectedFiles.length}
          totalCount={state.entries.length}
          cost={state.cost}
          model={state.model}
          setModel={state.setModel}
          sortPolicy={state.sortPolicy}
          setSortPolicy={state.setSortPolicy}
          useCache={state.useCache}
          setUseCache={state.setUseCache}
          enabledWorkTypes={state.enabledWorkTypes}
          onOpenMasterEditor={onOpenMasterEditor}
          txt={{
            selected: txt.selected,
            cost: txt.cost,
            model: txt.model,
            sort: txt.sort,
            cache: txt.cache,
            workTypes: txt.workTypes,
            noWorkTypes: txt.noWorkTypes,
          }}
        />
        <PreAnalysisInfoSection
          workType={state.workType}
          setWorkType={state.setWorkType}
          station={state.station}
          setStation={state.setStation}
          enabledWorkTypes={state.enabledWorkTypes}
          txt={{
            workTypeLabel: txt.workTypeLabel,
            workTypePlaceholder: txt.workTypePlaceholder,
            stationLabel: txt.stationLabel,
            stationPlaceholder: txt.stationPlaceholder,
          }}
        />
        <ActionButtons
          onCancel={onCancel}
          onManualPairing={onManualPairing}
          onStart={handleStart}
          selectedFiles={state.selectedFiles}
          enabledWorkTypes={state.enabledWorkTypes}
          workType={state.workType}
          txt={{ cancel: txt.cancel, manual: txt.manual, start: txt.start }}
        />
      </div>
    </div>
  );
};

const AnalysisSetupModal: React.FC<AnalysisSetupModalProps> = ({
  files, lang, apiKey,
  onCancel, onStartAnalysis, onManualPairing, onInteractiveTest, onOpenMasterEditor, onOpenSettings
}) => (
  <AnalysisSetupModalInner
    files={files}
    lang={lang}
    apiKey={apiKey}
    actions={{ onCancel, onStartAnalysis, onManualPairing, onInteractiveTest, onOpenMasterEditor, onOpenSettings }}
  />
);

export default AnalysisSetupModal;
export { PreAnalysisInfo } from './useAnalysisSetupState';
