import React, { useState, useEffect, useRef } from 'react';
import { Wand2, Save, PlusCircle, Edit2, CheckSquare, Square, Trash2, X, Play, Download, Upload, Tag, Lightbulb, Search, Library, RefreshCw } from 'lucide-react';
import { TRANS } from '../utils/translations';
import { AnalysisRule, getRules, saveRule, deleteRule, exportRulesToJson, importRulesFromJson } from '../utils/storage';
import { PhotoRecord } from '../types';

// Declare saveAs
declare const saveAs: any;

interface RefineModalProps {
  lang: 'en' | 'ja';
  photos: PhotoRecord[]; // Current photos to analyze context
  onClose: () => void;
  onRunAnalysis: (instruction: string, batchSize: number) => void;
}

const STORAGE_KEY_PROMPT = 'gemini_last_refine_prompt';

const PRESET_RULES: Partial<AnalysisRule>[] = [
  {
    name: "安全管理重点 (Safety Focus)",
    instruction: "Describe safety measures in detail. Mention safety cones, helmets, barricades, and signage visible in the 'Description' field.",
    tags: ["安全", "保安", "Safety"]
  },
  {
    name: "機材・機械抽出 (Equipment List)",
    instruction: "List all construction machinery (excavators, rollers, dump trucks) visible in the photo in the 'Description' or 'Remarks'.",
    tags: ["機械", "重機", "Equipment"]
  },
  {
    name: "黒板情報厳守 (Strict Blackboard)",
    instruction: "Do NOT infer Station or Work Type from visual context. Only extract text that is clearly legible on the blackboard. If illegible, leave blank.",
    tags: ["黒板", "OCR", "Strict"]
  },
  {
    name: "英語出力 (English Output)",
    instruction: "Translate all output fields (Work Type, Remarks, Description) into English.",
    tags: ["翻訳", "English"]
  }
];

const RefineModal: React.FC<RefineModalProps> = ({ lang, photos, onClose, onRunAnalysis }) => {
  const txt = TRANS[lang];
  const [customPrompt, setCustomPrompt] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [ruleTags, setRuleTags] = useState(""); // Comma separated tags
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null); 
  const [checkedRuleIds, setCheckedRuleIds] = useState<string[]>([]); 
  const [savedRules, setSavedRules] = useState<AnalysisRule[]>([]);
  const [batchSize, setBatchSize] = useState(6);
  const [autoMatchedCount, setAutoMatchedCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 1. Restore last used prompt from storage
    const lastPrompt = localStorage.getItem(STORAGE_KEY_PROMPT) || "";
    if (lastPrompt) {
      setCustomPrompt(lastPrompt);
    }

    // 2. Load rules and auto-match
    getRules().then(rules => {
      setSavedRules(rules);
      
      // Only auto-fill if prompt is empty to avoid overwriting user's ongoing work
      if (!lastPrompt) {
        autoSelectRules(rules);
      } else {
        // Still calculate match count for notification
        const count = countMatches(rules);
        setAutoMatchedCount(count);
      }
    });
  }, []); // Run once on mount

  // Save prompt to storage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROMPT, customPrompt);
  }, [customPrompt]);

  const countMatches = (rules: AnalysisRule[]): number => {
    const contextText = photos.map(p => 
      `${p.fileName} ${p.analysis?.workType || ''} ${p.analysis?.remarks || ''} ${p.analysis?.description || ''}`
    ).join(' ').toLowerCase();

    let count = 0;
    rules.forEach(rule => {
      if (!rule.tags || rule.tags.length === 0) return;
      const isMatch = rule.tags.some(tag => {
        const cleanTag = tag.trim().toLowerCase();
        return cleanTag && contextText.includes(cleanTag);
      });
      if (isMatch) count++;
    });
    return count;
  };

  // "Smart" Auto-Selection Logic
  const autoSelectRules = (rules: AnalysisRule[]) => {
    // Gather context from current photos
    const contextText = photos.map(p => 
      `${p.fileName} ${p.analysis?.workType || ''} ${p.analysis?.remarks || ''} ${p.analysis?.description || ''}`
    ).join(' ').toLowerCase();

    const matchedIds: string[] = [];
    
    rules.forEach(rule => {
      if (!rule.tags || rule.tags.length === 0) return;
      
      // Check if any tag matches the context
      const isMatch = rule.tags.some(tag => {
        const cleanTag = tag.trim().toLowerCase();
        return cleanTag && contextText.includes(cleanTag);
      });

      if (isMatch) {
        matchedIds.push(rule.id);
      }
    });

    if (matchedIds.length > 0) {
      setCheckedRuleIds(matchedIds);
      setAutoMatchedCount(matchedIds.length);
      
      // Construct initial prompt from matched rules
      const combinedInstruction = rules
        .filter(r => matchedIds.includes(r.id))
        .map(r => r.instruction)
        .join('\n\n');
      setCustomPrompt(combinedInstruction);
    }
  };

  const handleSaveRule = async (autoName?: string) => {
    const promptToSave = customPrompt.trim();
    if (!promptToSave) return;
    
    const nameToSave = ruleName.trim() || autoName;
    if (!nameToSave) return;

    // Process tags
    const tagsArray = ruleTags.split(/,|、/).map(t => t.trim()).filter(t => t.length > 0);

    const id = selectedRuleId || Date.now().toString();
    const newRule: AnalysisRule = {
      id: id,
      name: nameToSave,
      instruction: promptToSave,
      tags: tagsArray
    };

    await saveRule(newRule);
    setSavedRules(prev => {
      if (selectedRuleId) {
        return prev.map(r => r.id === selectedRuleId ? newRule : r);
      }
      return [...prev, newRule];
    });
    
    // Reset edit state
    handleResetForm();
  };

  const handleDeleteRule = async (id: string) => {
    await deleteRule(id);
    setSavedRules(prev => prev.filter(r => r.id !== id));
    if (selectedRuleId === id) {
      handleResetForm();
    }
    if (checkedRuleIds.includes(id)) {
      setCheckedRuleIds(prev => prev.filter(cid => cid !== id));
    }
  };

  const handleLoadPresets = async () => {
    if (!confirm(lang === 'ja' ? "おすすめルールを追加しますか？" : "Add recommended rules?")) return;
    
    for (const preset of PRESET_RULES) {
      // Check for duplicates by name
      if (!savedRules.some(r => r.name === preset.name)) {
        const newRule: AnalysisRule = {
          id: Date.now().toString() + Math.random().toString().slice(2, 5),
          name: preset.name!,
          instruction: preset.instruction!,
          tags: preset.tags
        };
        await saveRule(newRule);
      }
    }
    const updatedRules = await getRules();
    setSavedRules(updatedRules);
  };

  const handleToggleRule = (rule: AnalysisRule) => {
    const isChecked = checkedRuleIds.includes(rule.id);
    let newCheckedIds: string[];
    let newPrompt = customPrompt;

    if (isChecked) {
      newCheckedIds = checkedRuleIds.filter(id => id !== rule.id);
      // Try to remove text (simple check)
      if (newPrompt.includes(rule.instruction)) {
         newPrompt = newPrompt.replace(rule.instruction, "").trim();
      }
    } else {
      newCheckedIds = [...checkedRuleIds, rule.id];
      // Append if not already present
      if (!newPrompt.includes(rule.instruction)) {
         newPrompt = newPrompt ? newPrompt + "\n\n" + rule.instruction : rule.instruction;
      }
    }
    
    // Clean up newlines
    newPrompt = newPrompt.replace(/\n{3,}/g, '\n\n').trim();

    setCheckedRuleIds(newCheckedIds);
    setCustomPrompt(newPrompt);
    
    if (selectedRuleId && selectedRuleId !== rule.id) {
      handleResetForm();
    }
  };

  const handleSelectRuleForEdit = (e: React.MouseEvent, rule: AnalysisRule) => {
    e.stopPropagation();
    setCheckedRuleIds([]); // Clear composition when editing
    setCustomPrompt(rule.instruction);
    setRuleName(rule.name);
    setRuleTags(rule.tags?.join(", ") || "");
    setSelectedRuleId(rule.id);
  };

  const handleResetForm = () => {
    setCustomPrompt("");
    setRuleName("");
    setRuleTags("");
    setSelectedRuleId(null);
    setCheckedRuleIds([]);
    setAutoMatchedCount(0);
  };

  const handleExportRules = () => {
    if (savedRules.length === 0) return;
    const jsonStr = exportRulesToJson(savedRules);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    saveAs(blob, `construction_ai_rules_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleImportRules = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const importedRules = importRulesFromJson(ev.target?.result as string);
        for (const rule of importedRules) {
          await saveRule(rule);
        }
        const updatedRules = await getRules();
        setSavedRules(updatedRules);
        alert(lang === 'ja' ? `${importedRules.length}件のルールをインポートしました。` : `Imported ${importedRules.length} rules.`);
      } catch (err) {
        alert(lang === 'ja' ? "ルールの読み込みに失敗しました。" : "Failed to import rules.");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleRunClick = async () => {
    if (!customPrompt.trim()) return;

    if (!ruleName.trim() && !selectedRuleId) {
      // Auto-generate name logic...
      let autoName = customPrompt.split(/[。\n]/)[0].substring(0, 20);
      if (customPrompt.length > 20) autoName += "...";
      await handleSaveRule(autoName);
    } else if (ruleName.trim()) {
      await handleSaveRule();
    }

    onRunAnalysis(customPrompt, batchSize);
  };

  const handleReanalyzeAll = () => {
    if (confirm(lang === 'ja' 
      ? "現在表示中のすべての写真を再解析しますか？\n手動で修正した箇所は維持されますが、それ以外の項目は最新のAIロジックで上書きされます。" 
      : "Re-analyze all photos?\nManual edits will be preserved, but other fields will be overwritten by the latest AI logic.")) {
       onRunAnalysis("__REANALYZE__", batchSize);
    }
  };

  // Filter rules based on search
  const filteredRules = savedRules.filter(r => 
    searchTerm === "" || 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.tags?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto flex flex-col">
         <div className="flex items-center gap-3 mb-2 text-purple-600">
            <Wand2 className="w-8 h-8" />
            <h3 className="text-xl font-bold">{txt.refineTitle}</h3>
         </div>
         <p className="text-gray-600 text-sm mb-4">{txt.refineDesc}</p>

         {/* Batch Size Slider */}
         <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-blue-800">Batch Size (Speed vs Quality)</label>
              <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-blue-200">{batchSize} photos/req</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="15" 
              value={batchSize} 
              onChange={(e) => setBatchSize(parseInt(e.target.value))}
              className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
               <span>1 (Slow, Precise)</span>
               <span>15 (Fast)</span>
            </div>
         </div>

         {/* Instruction Input */}
         <div className="mb-4">
           <textarea
             value={customPrompt}
             onChange={(e) => setCustomPrompt(e.target.value)}
             placeholder={txt.refinePlaceholder}
             className="w-full h-32 border border-gray-300 rounded-lg p-3 text-base bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-purple-500 outline-none resize-none font-mono text-sm"
           />
         </div>

         {/* Rule Management Section */}
         <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <label className="flex items-center gap-2 font-bold text-gray-700 text-sm">
                 <Save className="w-4 h-4" /> {txt.saveRuleLabel}
              </label>
              {selectedRuleId ? (
                <button onClick={handleResetForm} className="text-xs flex items-center gap-1 text-red-600 hover:text-red-800 font-bold bg-red-50 px-2 py-1 rounded border border-red-200">
                  <X className="w-3 h-3" /> {txt.cancelEdit}
                </button>
              ) : (
                <button onClick={handleResetForm} className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-700 font-bold bg-white px-2 py-1 rounded border border-gray-200">
                   <PlusCircle className="w-3 h-3" /> {txt.newRule}
                </button>
              )}
            </div>
            
            <div className="flex flex-col gap-2">
              <input 
                type="text" 
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder={txt.ruleNamePlaceholder}
                className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              />
              <div className="flex gap-2">
                 <div className="flex-1 relative">
                    <Tag className="w-4 h-4 text-gray-400 absolute left-2 top-2.5" />
                    <input 
                      type="text" 
                      value={ruleTags}
                      onChange={(e) => setRuleTags(e.target.value)}
                      placeholder={lang === 'ja' ? "タグ（カンマ区切り：舗装, 完了, 例外...）" : "Tags (comma separated: Paving, Done...)"}
                      className="w-full border border-gray-300 rounded p-2 pl-8 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                 </div>
                 <button 
                  onClick={() => handleSaveRule()}
                  disabled={!customPrompt.trim()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded shadow disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                >
                  {selectedRuleId ? txt.btnUpdateRule : txt.btnSaveRule}
                </button>
              </div>
            </div>
         </div>

         {/* Saved Rules List Header */}
         <div className="mb-2 flex flex-col gap-2">
           <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-gray-700">{txt.savedRulesTitle}</h4>
              <button 
                onClick={handleLoadPresets}
                className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded border border-blue-200 transition-colors"
              >
                <Library className="w-3 h-3" /> {txt.loadPreset}
              </button>
           </div>
           
           {/* Search Bar */}
           <div className="relative">
             <Search className="w-4 h-4 text-gray-400 absolute left-2 top-2.5" />
             <input 
               type="text" 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               placeholder={txt.searchPlaceholder}
               className="w-full pl-8 pr-2 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-purple-400 outline-none bg-gray-50"
             />
           </div>

           {autoMatchedCount > 0 && (
              <div className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1 animate-pulse">
                 <Lightbulb className="w-3 h-3" /> {lang === 'ja' ? `AIが ${autoMatchedCount}件 推奨中` : `AI suggests ${autoMatchedCount} rules`}
              </div>
            )}
         </div>

         {/* Saved Rules List Body */}
         <div className="mb-4 flex-1 min-h-0 flex flex-col border border-gray-100 rounded p-1 bg-gray-50/50">
           {filteredRules.length === 0 ? (
             <div className="p-4 text-center text-gray-400 text-xs italic">
               {savedRules.length === 0 ? txt.noRulesYet : "No matching rules found."}
             </div>
           ) : (
             <div className="space-y-2 overflow-y-auto pr-1 max-h-40">
               {filteredRules.map(rule => {
                 const isChecked = checkedRuleIds.includes(rule.id);
                 const isEditing = selectedRuleId === rule.id;
                 const hasTags = rule.tags && rule.tags.length > 0;
                 return (
                  <div 
                    key={rule.id} 
                    onClick={() => handleToggleRule(rule)}
                    className={`flex items-center justify-between p-2 rounded border group cursor-pointer transition-all ${
                      isEditing 
                        ? 'bg-purple-100 border-purple-400 ring-1 ring-purple-400' 
                        : isChecked 
                          ? 'bg-blue-50 border-blue-200' 
                          : 'bg-white border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                       <div className="text-gray-500 hover:text-blue-600 flex-shrink-0">
                         {isChecked ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                       </div>
                       <div className="flex flex-col truncate">
                          <span className={`text-sm font-medium truncate ${isChecked ? 'text-blue-800 font-bold' : 'text-gray-700'}`}>
                            {rule.name}
                          </span>
                          {hasTags && (
                             <div className="flex gap-1 overflow-hidden">
                                {rule.tags!.map(tag => (
                                   <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded border border-gray-200 truncate max-w-[60px]">{tag}</span>
                                ))}
                             </div>
                          )}
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-1 pl-2">
                      <button 
                         onClick={(e) => handleSelectRuleForEdit(e, rule)}
                         className={`p-2 rounded-full hover:bg-purple-100 transition-colors ${isEditing ? 'text-purple-600 bg-purple-100' : 'text-gray-400'}`}
                         title="Edit"
                      >
                         <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteRule(rule.id); }}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                 );
               })}
             </div>
           )}
         </div>

         {/* Footer Actions */}
         <div className="flex justify-between items-center pt-2 pb-4 border-b border-gray-100 mb-4">
            <div className="text-xs text-gray-400 font-bold uppercase tracking-wide">Data Options</div>
            <div className="flex gap-2">
               <button onClick={handleExportRules} disabled={savedRules.length === 0} className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-700 px-2 py-1 bg-gray-100 rounded disabled:opacity-50">
                 <Download className="w-3 h-3" /> JSON
               </button>
               <button onClick={() => fileInputRef.current?.click()} className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-700 px-2 py-1 bg-gray-100 rounded">
                 <Upload className="w-3 h-3" /> Import
               </button>
               <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportRules} />
            </div>
         </div>
         
         {/* Re-analyze Button */}
         <div className="mb-4">
            <button 
              onClick={handleReanalyzeAll}
              className="w-full py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> {txt.btnReanalyzeAll}
            </button>
         </div>

         <div className="flex gap-3">
           <button onClick={onClose} className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-bold transition-colors">{txt.btnCancel}</button>
           <button 
             onClick={handleRunClick} 
             disabled={!customPrompt.trim()}
             className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md disabled:opacity-50 flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02]"
           >
             <Play className="w-5 h-5 fill-current" /> {txt.btnRefine}
           </button>
         </div>
      </div>
    </div>
  );
};

export default RefineModal;