import React, { useState, useEffect, useRef } from 'react';
import { Wand2, Save, PlusCircle, Edit2, CheckSquare, Square, Trash2, X, Play, Download, Upload, Tag, Lightbulb, Search, Library, RefreshCw } from 'lucide-react';
import { TRANS } from '../utils/translations';
import { AnalysisRule, getRules, saveRule, deleteRule, exportRulesToJson, importRulesFromJson } from '../utils/storage';
import { PhotoRecord } from '../types';

declare const saveAs: any;

interface RefineModalProps {
  lang: 'en' | 'ja';
  photos: PhotoRecord[];
  onClose: () => void;
  onRunAnalysis: (instruction: string, batchSize: number) => void;
}

const STORAGE_KEY_PROMPT = 'gemini_last_refine_prompt';

const PRESET_RULES: Partial<AnalysisRule>[] = [
  { name: "安全管理重点 (Safety Focus)", instruction: "Describe safety measures in detail. Mention safety cones, helmets, barricades, and signage visible in the 'Description' field.", tags: ["安全", "保安", "Safety"] },
  { name: "機材・機械抽出 (Equipment List)", instruction: "List all construction machinery (excavators, rollers, dump trucks) visible in the photo in the 'Description' or 'Remarks'.", tags: ["機械", "重機", "Equipment"] },
  { name: "黒板情報厳守 (Strict Blackboard)", instruction: "Do NOT infer Station or Work Type from visual context. Only extract text that is clearly legible on the blackboard. If illegible, leave blank.", tags: ["黒板", "OCR", "Strict"] },
  { name: "英語出力 (English Output)", instruction: "Translate all output fields (Work Type, Remarks, Description) into English.", tags: ["翻訳", "English"] }
];

const RefineModal: React.FC<RefineModalProps> = ({ lang, photos, onClose, onRunAnalysis }) => {
  const txt = TRANS[lang];
  const [customPrompt, setCustomPrompt] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [ruleTags, setRuleTags] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [checkedRuleIds, setCheckedRuleIds] = useState<string[]>([]);
  const [savedRules, setSavedRules] = useState<AnalysisRule[]>([]);
  const [batchSize, setBatchSize] = useState(6);
  const [autoMatchedCount, setAutoMatchedCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getContextText = () => photos.map(p =>
    `${p.fileName} ${p.analysis?.workType || ''} ${p.analysis?.remarks || ''} ${p.analysis?.description || ''}`
  ).join(' ').toLowerCase();

  const getMatchingRuleIds = (rules: AnalysisRule[], contextText: string) =>
    rules.filter(r => r.tags?.some(tag => tag.trim().toLowerCase() && contextText.includes(tag.trim().toLowerCase()))).map(r => r.id);

  useEffect(() => {
    const lastPrompt = localStorage.getItem(STORAGE_KEY_PROMPT) || "";
    if (lastPrompt) setCustomPrompt(lastPrompt);

    getRules().then(rules => {
      setSavedRules(rules);
      const contextText = getContextText();
      const matchedIds = getMatchingRuleIds(rules, contextText);
      setAutoMatchedCount(matchedIds.length);

      if (!lastPrompt && matchedIds.length > 0) {
        setCheckedRuleIds(matchedIds);
        setCustomPrompt(rules.filter(r => matchedIds.includes(r.id)).map(r => r.instruction).join('\n\n'));
      }
    });
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY_PROMPT, customPrompt); }, [customPrompt]);

  const resetForm = () => {
    setCustomPrompt(""); setRuleName(""); setRuleTags("");
    setSelectedRuleId(null); setCheckedRuleIds([]); setAutoMatchedCount(0);
  };

  const handleSaveRule = async (autoName?: string) => {
    const promptToSave = customPrompt.trim();
    const nameToSave = ruleName.trim() || autoName;
    if (!promptToSave || !nameToSave) return;

    const tagsArray = ruleTags.split(/,|、/).map(t => t.trim()).filter(Boolean);
    const id = selectedRuleId || Date.now().toString();
    const newRule: AnalysisRule = { id, name: nameToSave, instruction: promptToSave, tags: tagsArray };

    await saveRule(newRule);
    setSavedRules(prev => selectedRuleId ? prev.map(r => r.id === selectedRuleId ? newRule : r) : [...prev, newRule]);
    resetForm();
  };

  const handleDeleteRule = async (id: string) => {
    await deleteRule(id);
    setSavedRules(prev => prev.filter(r => r.id !== id));
    if (selectedRuleId === id) resetForm();
    setCheckedRuleIds(prev => prev.filter(cid => cid !== id));
  };

  const handleLoadPresets = async () => {
    if (!confirm(lang === 'ja' ? "おすすめルールを追加しますか？" : "Add recommended rules?")) return;
    for (const preset of PRESET_RULES) {
      if (!savedRules.some(r => r.name === preset.name)) {
        await saveRule({ id: Date.now().toString() + Math.random().toString().slice(2, 5), name: preset.name!, instruction: preset.instruction!, tags: preset.tags });
      }
    }
    setSavedRules(await getRules());
  };

  const handleToggleRule = (rule: AnalysisRule) => {
    const isChecked = checkedRuleIds.includes(rule.id);
    const newCheckedIds = isChecked ? checkedRuleIds.filter(id => id !== rule.id) : [...checkedRuleIds, rule.id];
    let newPrompt = isChecked
      ? customPrompt.replace(rule.instruction, "").trim()
      : (customPrompt ? customPrompt + "\n\n" + rule.instruction : rule.instruction);

    setCheckedRuleIds(newCheckedIds);
    setCustomPrompt(newPrompt.replace(/\n{3,}/g, '\n\n').trim());
    if (selectedRuleId && selectedRuleId !== rule.id) resetForm();
  };

  const handleSelectRuleForEdit = (e: React.MouseEvent, rule: AnalysisRule) => {
    e.stopPropagation();
    setCheckedRuleIds([]);
    setCustomPrompt(rule.instruction);
    setRuleName(rule.name);
    setRuleTags(rule.tags?.join(", ") || "");
    setSelectedRuleId(rule.id);
  };

  const handleExportRules = () => {
    if (savedRules.length === 0) return;
    saveAs(new Blob([exportRulesToJson(savedRules)], { type: 'application/json' }), `construction_ai_rules_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleImportRules = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const importedRules = importRulesFromJson(text);
      for (const rule of importedRules) await saveRule(rule);
      setSavedRules(await getRules());
      alert(lang === 'ja' ? `${importedRules.length}件のルールをインポートしました。` : `Imported ${importedRules.length} rules.`);
    } catch { alert(lang === 'ja' ? "ルールの読み込みに失敗しました。" : "Failed to import rules."); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRunClick = async () => {
    if (!customPrompt.trim()) return;
    if (!ruleName.trim() && !selectedRuleId) {
      const autoName = customPrompt.split(/[。\n]/)[0].substring(0, 20) + (customPrompt.length > 20 ? "..." : "");
      await handleSaveRule(autoName);
    } else if (ruleName.trim()) await handleSaveRule();
    onRunAnalysis(customPrompt, batchSize);
  };

  const handleReanalyzeAll = () => {
    if (confirm(lang === 'ja' ? "現在表示中のすべての写真を再解析しますか？\n手動で修正した箇所は維持されますが、それ以外の項目は最新のAIロジックで上書きされます。"
      : "Re-analyze all photos?\nManual edits will be preserved, but other fields will be overwritten by the latest AI logic.")) {
      onRunAnalysis("__REANALYZE__", batchSize);
    }
  };

  const filteredRules = savedRules.filter(r =>
    !searchTerm || r.name.toLowerCase().includes(searchTerm.toLowerCase()) || r.tags?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center gap-3 mb-2 text-purple-600">
          <Wand2 className="w-8 h-8" />
          <h3 className="text-xl font-bold">{txt.refineTitle}</h3>
        </div>
        <p className="text-gray-600 text-sm mb-4">{txt.refineDesc}</p>

        <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-bold text-blue-800">Batch Size (Speed vs Quality)</label>
            <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-blue-200">{batchSize} photos/req</span>
          </div>
          <input type="range" min="1" max="15" value={batchSize} onChange={e => setBatchSize(parseInt(e.target.value))}
            className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer" />
          <div className="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>1 (Slow, Precise)</span><span>15 (Fast)</span>
          </div>
        </div>

        <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder={txt.refinePlaceholder}
          className="w-full h-32 border border-gray-300 rounded-lg p-3 mb-4 text-sm font-mono bg-white focus:ring-2 focus:ring-purple-500 outline-none resize-none" />

        <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <label className="flex items-center gap-2 font-bold text-gray-700 text-sm"><Save className="w-4 h-4" /> {txt.saveRuleLabel}</label>
            <button onClick={resetForm} className={`text-xs flex items-center gap-1 px-2 py-1 rounded border ${selectedRuleId ? 'text-red-600 bg-red-50 border-red-200' : 'text-gray-500 bg-white border-gray-200'}`}>
              {selectedRuleId ? <><X className="w-3 h-3" /> {txt.cancelEdit}</> : <><PlusCircle className="w-3 h-3" /> {txt.newRule}</>}
            </button>
          </div>
          <input type="text" value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder={txt.ruleNamePlaceholder}
            className="w-full border border-gray-300 rounded p-2 text-sm mb-2 focus:ring-2 focus:ring-purple-500 outline-none" />
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Tag className="w-4 h-4 text-gray-400 absolute left-2 top-2.5" />
              <input type="text" value={ruleTags} onChange={e => setRuleTags(e.target.value)}
                placeholder={lang === 'ja' ? "タグ（カンマ区切り）" : "Tags (comma separated)"}
                className="w-full border border-gray-300 rounded p-2 pl-8 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
            </div>
            <button onClick={() => handleSaveRule()} disabled={!customPrompt.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded shadow disabled:opacity-50">
              {selectedRuleId ? txt.btnUpdateRule : txt.btnSaveRule}
            </button>
          </div>
        </div>

        <div className="mb-2 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold text-gray-700">{txt.savedRulesTitle}</h4>
            <button onClick={handleLoadPresets} className="text-xs flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200">
              <Library className="w-3 h-3" /> {txt.loadPreset}
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-2 top-2.5" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={txt.searchPlaceholder}
              className="w-full pl-8 pr-2 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-purple-400 outline-none bg-gray-50" />
          </div>
          {autoMatchedCount > 0 && (
            <div className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1 animate-pulse">
              <Lightbulb className="w-3 h-3" /> {lang === 'ja' ? `AIが ${autoMatchedCount}件 推奨中` : `AI suggests ${autoMatchedCount} rules`}
            </div>
          )}
        </div>

        <div className="mb-4 flex-1 min-h-0 border border-gray-100 rounded p-1 bg-gray-50/50">
          {filteredRules.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs italic">{savedRules.length === 0 ? txt.noRulesYet : "No matching rules found."}</div>
          ) : (
            <div className="space-y-2 overflow-y-auto pr-1 max-h-40">
              {filteredRules.map(rule => {
                const isChecked = checkedRuleIds.includes(rule.id), isEditing = selectedRuleId === rule.id;
                return (
                  <div key={rule.id} onClick={() => handleToggleRule(rule)}
                    className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-all ${isEditing ? 'bg-purple-100 border-purple-400 ring-1 ring-purple-400' : isChecked ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:border-purple-300'}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {isChecked ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-500" />}
                      <div className="flex flex-col truncate">
                        <span className={`text-sm truncate ${isChecked ? 'text-blue-800 font-bold' : 'text-gray-700'}`}>{rule.name}</span>
                        {rule.tags?.length ? (
                          <div className="flex gap-1 overflow-hidden">
                            {rule.tags.map(tag => <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded border border-gray-200 truncate max-w-[60px]">{tag}</span>)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pl-2">
                      <button onClick={e => handleSelectRuleForEdit(e, rule)} className={`p-2 rounded-full hover:bg-purple-100 ${isEditing ? 'text-purple-600 bg-purple-100' : 'text-gray-400'}`}><Edit2 className="w-4 h-4" /></button>
                      <button onClick={e => { e.stopPropagation(); handleDeleteRule(rule.id); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"><Trash2 className="w-4 h-4" /></button>
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
            <button onClick={handleExportRules} disabled={savedRules.length === 0} className="text-xs flex items-center gap-1 text-gray-500 px-2 py-1 bg-gray-100 rounded disabled:opacity-50">
              <Download className="w-3 h-3" /> JSON
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="text-xs flex items-center gap-1 text-gray-500 px-2 py-1 bg-gray-100 rounded">
              <Upload className="w-3 h-3" /> Import
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportRules} />
          </div>
        </div>

        <button onClick={handleReanalyzeAll} className="w-full py-2 mb-4 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4" /> {txt.btnReanalyzeAll}
        </button>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-bold">{txt.btnCancel}</button>
          <button onClick={handleRunClick} disabled={!customPrompt.trim()}
            className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
            <Play className="w-5 h-5 fill-current" /> {txt.btnRefine}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RefineModal;
