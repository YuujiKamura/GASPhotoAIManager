import React from 'react';
import { X } from 'lucide-react';
import { SortPolicy } from '../../types';
import { setSelectedModel } from '../../services/geminiService';
import { PhotoGrid, SettingsSection, ActionButtons, PreAnalysisInfoSection, PromptPreviewSection } from './SubComponents';
import { useAnalysisSetupState } from './useAnalysisSetupState';
import type { PreAnalysisInfo } from './useAnalysisSetupState';

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
  postProcess: lang === 'ja' ? '後処理' : 'Post-processing',
  all: lang === 'ja' ? '全選択' : 'All',
  none: lang === 'ja' ? '解除' : 'None',
  cancel: lang === 'ja' ? 'キャンセル' : 'Cancel',
  manual: lang === 'ja' ? '手動ペアリング' : 'Manual Pairing',
  start: lang === 'ja' ? '解析開始' : 'Start',
  useCache: lang === 'ja' ? 'キャッシュを利用' : 'Use Cache',
  clickToTest: lang === 'ja' ? 'クリックで対話型テスト' : 'Click for interactive test',
  clearCache: lang === 'ja' ? 'キャッシュ削除' : 'Clear Cache',
  workTypeLabel: lang === 'ja' ? '工種（必須）' : 'Work Type (Required)',
  workTypePlaceholder: lang === 'ja' ? '工種を選択...' : 'Select work type...',
  stationLabel: lang === 'ja' ? '測点（任意）' : 'Station (Optional)',
  stationPlaceholder: lang === 'ja' ? '例: No.5+10' : 'e.g. No.5+10',
  showPrompt: lang === 'ja' ? '解析プロンプトを表示' : 'Show Analysis Prompt',
  hidePrompt: lang === 'ja' ? 'プロンプトを隠す' : 'Hide Prompt',
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
    // Always do fresh analysis (useCache = false)
    onStartAnalysis(state.selectedFiles, state.sortPolicy, false, state.preInfo);
  };

  const handleUseCache = () => {
    if (state.selectedCachedCount === 0) return;
    setSelectedModel(state.model);
    // Use cached results (useCache = true)
    onStartAnalysis(state.selectedFiles, state.sortPolicy, true, state.preInfo);
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
          postProcessType={state.postProcessType}
          setPostProcessType={state.setPostProcessType}
          txt={{
            selected: txt.selected,
            cost: txt.cost,
            model: txt.model,
            sort: txt.sort,
            postProcess: txt.postProcess,
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
        <PromptPreviewSection
          txt={{
            showPrompt: txt.showPrompt,
            hidePrompt: txt.hidePrompt,
          }}
        />
        <ActionButtons
          onCancel={onCancel}
          onManualPairing={onManualPairing}
          onStart={handleStart}
          onUseCache={handleUseCache}
          onOpenSettings={onOpenSettings}
          selectedFiles={state.selectedFiles}
          enabledWorkTypes={state.enabledWorkTypes}
          workType={state.workType}
          apiKey={apiKey}
          cachedCount={state.selectedCachedCount}
          txt={{ cancel: txt.cancel, manual: txt.manual, start: txt.start, useCache: txt.useCache }}
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
export type { PreAnalysisInfo } from './useAnalysisSetupState';
