import React, { useState } from 'react';
import { Wand2, Save, PlusCircle, Edit2, CheckSquare, Square, Trash2, X, Play, Download, Upload, Tag, Lightbulb, Search, Library, RefreshCw, HelpCircle, Loader2, ChevronDown } from 'lucide-react';
import { TRANS } from '../utils/translations';
import { PhotoRecord } from '../types';
import { useRefineModalState } from '../hooks/useRefineModalState';

interface RefineModalProps {
  lang: 'en' | 'ja';
  photos: PhotoRecord[];
  onClose: () => void;
  onRunAnalysis: (instruction: string, batchSize: number) => void;
  apiKey?: string | null;
}

const RefineModal: React.FC<RefineModalProps> = ({ lang, photos, onClose, onRunAnalysis, apiKey }) => {
  const txt = TRANS[lang];
  const state = useRefineModalState(photos, lang, apiKey);
  const [showPhotoSelector, setShowPhotoSelector] = useState(false);

  const handleRunClick = async () => {
    if (!state.customPrompt.trim()) return;
    if (!state.ruleName.trim() && !state.selectedRuleId) {
      const autoName = state.customPrompt.split(/[。\n]/)[0].substring(0, 20) + (state.customPrompt.length > 20 ? "..." : "");
      await state.handleSaveRule(autoName);
    } else if (state.ruleName.trim()) await state.handleSaveRule();
    onRunAnalysis(state.customPrompt, state.batchSize);
  };

  const handleReanalyzeAll = () => {
    if (confirm(lang === 'ja' ? "現在表示中のすべての写真を再解析しますか？\n手動で修正した箇所は維持されますが、それ以外の項目は最新のAIロジックで上書きされます。"
      : "Re-analyze all photos?\nManual edits will be preserved, but other fields will be overwritten by the latest AI logic.")) {
      onRunAnalysis("__REANALYZE__", state.batchSize);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center gap-3 mb-2 text-purple-600"><Wand2 className="w-8 h-8" /><h3 className="text-xl font-bold">{txt.refineTitle}</h3></div>
        <p className="text-gray-600 text-sm mb-4">{txt.refineDesc}</p>

        <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-bold text-blue-800">Batch Size (Speed vs Quality)</label>
            <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-blue-200">{state.batchSize} photos/req</span>
          </div>
          <input type="range" min="1" max="15" value={state.batchSize} onChange={e => state.setBatchSize(parseInt(e.target.value))} className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer" />
          <div className="flex justify-between text-[10px] text-gray-500 mt-1"><span>1 (Slow, Precise)</span><span>15 (Fast)</span></div>
        </div>

        <textarea value={state.customPrompt} onChange={e => state.setCustomPrompt(e.target.value)} placeholder={txt.refinePlaceholder} className="w-full h-32 border border-gray-300 rounded-lg p-3 mb-4 text-sm font-mono bg-white focus:ring-2 focus:ring-purple-500 outline-none resize-none" />

        {/* 理由を聞く機能 */}
        <div className="mb-4 bg-amber-50 p-3 rounded-lg border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-amber-800 flex items-center gap-1">
              <HelpCircle className="w-4 h-4" />
              {lang === 'ja' ? '理由を聞く（再解析なし）' : 'Ask Why (No Re-analysis)'}
            </label>
          </div>
          <p className="text-xs text-amber-700 mb-2">
            {lang === 'ja'
              ? '上のテキストエリアに質問を入力して「理由を聞く」を押すと、AIが現在の解析結果について説明します。'
              : 'Enter your question above and click "Ask Why" to get an explanation of the current result.'}
          </p>

          {photos.length > 1 && (
            <div className="relative mb-2">
              <button
                onClick={() => setShowPhotoSelector(!showPhotoSelector)}
                className="w-full flex items-center justify-between px-3 py-2 bg-white border border-amber-300 rounded text-sm text-left"
              >
                <span className="truncate">
                  {state.selectedPhotoForWhy?.fileName || (lang === 'ja' ? '写真を選択...' : 'Select photo...')}
                </span>
                <ChevronDown className="w-4 h-4 text-amber-600" />
              </button>
              {showPhotoSelector && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {photos.filter(p => p.analysis).map(p => (
                    <button
                      key={p.fileName}
                      onClick={() => {
                        state.handleAskWhy(p);
                        setShowPhotoSelector(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-amber-50 border-b border-gray-100 last:border-0"
                    >
                      <div className="font-medium truncate">{p.fileName}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {p.analysis?.remarks || p.analysis?.workType || '(未分類)'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => state.handleAskWhy(photos.length === 1 ? photos[0] : undefined)}
            disabled={state.isAskingWhy || (photos.length > 1 && !state.selectedPhotoForWhy)}
            className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {state.isAskingWhy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {lang === 'ja' ? '問い合わせ中...' : 'Asking...'}
              </>
            ) : (
              <>
                <HelpCircle className="w-4 h-4" />
                {lang === 'ja' ? '理由を聞く' : 'Ask Why'}
              </>
            )}
          </button>

          {/* 回答表示 */}
          {state.whyResponse && (
            <div className="mt-3 p-3 bg-white border border-amber-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-800">
                  {state.selectedPhotoForWhy?.fileName}
                </span>
                <button onClick={state.clearWhyResponse} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{state.whyResponse}</div>
            </div>
          )}
        </div>

        <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <label className="flex items-center gap-2 font-bold text-gray-700 text-sm"><Save className="w-4 h-4" /> {txt.saveRuleLabel}</label>
            <button onClick={state.resetForm} className={`text-xs flex items-center gap-1 px-2 py-1 rounded border ${state.selectedRuleId ? 'text-red-600 bg-red-50 border-red-200' : 'text-gray-500 bg-white border-gray-200'}`}>
              {state.selectedRuleId ? <><X className="w-3 h-3" /> {txt.cancelEdit}</> : <><PlusCircle className="w-3 h-3" /> {txt.newRule}</>}
            </button>
          </div>
          <input type="text" value={state.ruleName} onChange={e => state.setRuleName(e.target.value)} placeholder={txt.ruleNamePlaceholder} className="w-full border border-gray-300 rounded p-2 text-sm mb-2 focus:ring-2 focus:ring-purple-500 outline-none" />
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Tag className="w-4 h-4 text-gray-400 absolute left-2 top-2.5" />
              <input type="text" value={state.ruleTags} onChange={e => state.setRuleTags(e.target.value)} placeholder={lang === 'ja' ? "タグ（カンマ区切り）" : "Tags (comma separated)"} className="w-full border border-gray-300 rounded p-2 pl-8 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
            <button onClick={() => state.handleSaveRule()} disabled={!state.customPrompt.trim()} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded shadow disabled:opacity-50">
              {state.selectedRuleId ? txt.btnUpdateRule : txt.btnSaveRule}
            </button>
          </div>
        </div>

        <div className="mb-2 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold text-gray-700">{txt.savedRulesTitle}</h4>
            <button onClick={state.handleLoadPresets} className="text-xs flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200"><Library className="w-3 h-3" /> {txt.loadPreset}</button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-2 top-2.5" />
            <input type="text" value={state.searchTerm} onChange={e => state.setSearchTerm(e.target.value)} placeholder={txt.searchPlaceholder} className="w-full pl-8 pr-2 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-purple-400 outline-none bg-gray-50" />
          </div>
          {state.autoMatchedCount > 0 && <div className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1 animate-pulse"><Lightbulb className="w-3 h-3" /> {lang === 'ja' ? `AIが ${state.autoMatchedCount}件 推奨中` : `AI suggests ${state.autoMatchedCount} rules`}</div>}
        </div>

        <div className="mb-4 flex-1 min-h-0 border border-gray-100 rounded p-1 bg-gray-50/50">
          {state.filteredRules.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs italic">{state.savedRules.length === 0 ? txt.noRulesYet : "No matching rules found."}</div>
          ) : (
            <div className="space-y-2 overflow-y-auto pr-1 max-h-40">
              {state.filteredRules.map(rule => {
                const isChecked = state.checkedRuleIds.includes(rule.id), isEditing = state.selectedRuleId === rule.id;
                return (
                  <div key={rule.id} onClick={() => state.handleToggleRule(rule)} className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-all ${isEditing ? 'bg-purple-100 border-purple-400 ring-1 ring-purple-400' : isChecked ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:border-purple-300'}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {isChecked ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-500" />}
                      <div className="flex flex-col truncate">
                        <span className={`text-sm truncate ${isChecked ? 'text-blue-800 font-bold' : 'text-gray-700'}`}>{rule.name}</span>
                        {rule.tags?.length ? <div className="flex gap-1 overflow-hidden">{rule.tags.map(tag => <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded border border-gray-200 truncate max-w-[60px]">{tag}</span>)}</div> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pl-2">
                      <button onClick={e => state.handleSelectRuleForEdit(e, rule)} className={`p-2 rounded-full hover:bg-purple-100 ${isEditing ? 'text-purple-600 bg-purple-100' : 'text-gray-400'}`}><Edit2 className="w-4 h-4" /></button>
                      <button onClick={e => { e.stopPropagation(); state.handleDeleteRule(rule.id); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2 pb-4 border-b border-gray-100 mb-4">
          <div className="text-xs text-gray-400 font-bold uppercase tracking-wide">Data Options</div>
          <div className="flex gap-2">
            <button onClick={state.handleExportRules} disabled={state.savedRules.length === 0} className="text-xs flex items-center gap-1 text-gray-500 px-2 py-1 bg-gray-100 rounded disabled:opacity-50"><Download className="w-3 h-3" /> JSON</button>
            <button onClick={state.triggerImport} className="text-xs flex items-center gap-1 text-gray-500 px-2 py-1 bg-gray-100 rounded"><Upload className="w-3 h-3" /> Import</button>
            <input type="file" ref={state.fileInputRef} className="hidden" accept=".json" onChange={state.handleImportRules} />
          </div>
        </div>

        <button onClick={handleReanalyzeAll} className="w-full py-2 mb-4 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-sm font-bold flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> {txt.btnReanalyzeAll}</button>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-bold">{txt.btnCancel}</button>
          <button onClick={handleRunClick} disabled={!state.customPrompt.trim()} className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md disabled:opacity-50 flex items-center justify-center gap-2"><Play className="w-5 h-5 fill-current" /> {txt.btnRefine}</button>
        </div>
      </div>
    </div>
  );
};

export default RefineModal;
