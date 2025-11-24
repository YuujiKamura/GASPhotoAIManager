import React, { useState, useEffect, useRef } from 'react';
import { Wand2, Save, PlusCircle, Edit2, CheckSquare, Square, Trash2, X, Play, Download, Upload } from 'lucide-react';
import { TRANS } from '../utils/translations';
import { AnalysisRule, getRules, saveRule, deleteRule, exportRulesToJson, importRulesFromJson } from '../utils/storage';

// Declare saveAs
declare const saveAs: any;

interface RefineModalProps {
  lang: 'en' | 'ja';
  onClose: () => void;
  onRunAnalysis: (instruction: string, batchSize: number) => void;
}

const RefineModal: React.FC<RefineModalProps> = ({ lang, onClose, onRunAnalysis }) => {
  const txt = TRANS[lang];
  const [customPrompt, setCustomPrompt] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [checkedRuleIds, setCheckedRuleIds] = useState<string[]>([]);
  const [savedRules, setSavedRules] = useState<AnalysisRule[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getRules().then(setSavedRules);
  }, []);

  const handleSaveRule = async (autoName?: string) => {
    const promptToSave = customPrompt.trim();
    if (!promptToSave) return;

    // Use provided autoName or current input state
    const nameToSave = ruleName.trim() || autoName;
    if (!nameToSave) return;

    const id = selectedRuleId || Date.now().toString();
    const newRule: AnalysisRule = {
      id: id,
      name: nameToSave,
      instruction: promptToSave
    };
    await saveRule(newRule);
    setSavedRules(prev => {
      if (selectedRuleId) {
        return prev.map(r => r.id === selectedRuleId ? newRule : r);
      }
      return [...prev, newRule];
    });

    // Reset edit state to avoid overwriting on next save
    setRuleName("");
    setSelectedRuleId(null);
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

  const handleToggleRule = (rule: AnalysisRule) => {
    const isChecked = checkedRuleIds.includes(rule.id);
    let newCheckedIds: string[];
    let newPrompt = customPrompt;

    if (isChecked) {
      newCheckedIds = checkedRuleIds.filter(id => id !== rule.id);
      // Try to remove text (simple check)
      if (newPrompt.includes(rule.instruction)) {
        newPrompt = newPrompt.replace(rule.instruction, "").trim();
        newPrompt = newPrompt.replace(/\n\s*\n/g, '\n').trim();
      }
    } else {
      newCheckedIds = [...checkedRuleIds, rule.id];
      newPrompt = newPrompt ? newPrompt + "\n" + rule.instruction : rule.instruction;
    }

    setCheckedRuleIds(newCheckedIds);
    setCustomPrompt(newPrompt);

    // If we were editing a specific rule, clear edit mode to avoid confusion
    if (selectedRuleId && selectedRuleId !== rule.id) {
      setSelectedRuleId(null);
      setRuleName("");
    }
  };

  const handleSelectRuleForEdit = (e: React.MouseEvent, rule: AnalysisRule) => {
    e.stopPropagation();
    setCheckedRuleIds([]); // Clear composition when editing
    setCustomPrompt(rule.instruction);
    setRuleName(rule.name);
    setSelectedRuleId(rule.id);
  };

  const handleResetForm = () => {
    setCustomPrompt("");
    setRuleName("");
    setSelectedRuleId(null);
    setCheckedRuleIds([]);
  };

  // Export Rules
  const handleExportRules = () => {
    if (savedRules.length === 0) return;
    const jsonStr = exportRulesToJson(savedRules);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    saveAs(blob, `construction_ai_rules_${new Date().toISOString().slice(0, 10)}.json`);
  };

  // Import Rules
  const handleImportRules = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const importedRules = importRulesFromJson(ev.target?.result as string);
        // Save all imported rules
        for (const rule of importedRules) {
          await saveRule(rule);
        }
        // Refresh list
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

  const [batchSize, setBatchSize] = useState(6);

  // ... (existing code)

  // Wrapper to handle Run Analysis logic with auto-save if unnamed
  const handleRunClick = async () => {
    if (!customPrompt.trim()) return;

    // Auto-generate name if empty and not updating existing
    if (!ruleName.trim() && !selectedRuleId) {
      // Create name from first sentence or first 20 chars
      let autoName = customPrompt.split(/[。\n]/)[0].substring(0, 20);
      if (customPrompt.length > 20) autoName += "...";

      // Save automatically as a new rule
      await handleSaveRule(autoName);
    } else if (ruleName.trim()) {
      // If user typed a name but hit Run, save/update it before running
      await handleSaveRule();
    }

    onRunAnalysis(customPrompt, batchSize);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center gap-3 mb-2 text-purple-600">
          <Wand2 className="w-8 h-8" />
          <h3 className="text-xl font-bold">{txt.refineTitle}</h3>
        </div>
        <p className="text-gray-600 text-sm mb-6">{txt.refineDesc}</p>

        {/* Instruction Input */}
        <div className="mb-6">
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={txt.refinePlaceholder}
            className="w-full h-32 border border-gray-300 rounded-lg p-3 text-base focus:ring-2 focus:ring-purple-500 outline-none resize-none"
          />
        </div>

        {/* Batch Size Slider */}
        <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
          <div className="flex justify-between items-center mb-2">
            <label className="font-bold text-gray-700 text-sm">
              Batch Size (Simultaneous Photos)
            </label>
            <span className="text-blue-600 font-bold text-lg">{batchSize}</span>
          </div>
          <input
            type="range"
            min="1"
            max="15"
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <p className="text-xs text-gray-500 mt-1">
            Larger batches = Faster but higher risk of timeout/errors. Recommended: 3-6.
          </p>
        </div>

        {/* Rule Management Section */}
        {/* ... (rest of the code) */}
        <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <label className="flex items-center gap-2 font-bold text-gray-700 text-sm">
              <Save className="w-4 h-4" /> {txt.saveRuleLabel}
            </label>
            {selectedRuleId && (
              <button
                onClick={handleResetForm}
                className="text-xs flex items-center gap-1 text-red-600 hover:text-red-800 font-bold bg-red-50 px-2 py-1 rounded border border-red-200 hover:bg-red-100"
              >
                <X className="w-3 h-3" /> {txt.cancelEdit}
              </button>
            )}
            {(!selectedRuleId && checkedRuleIds.length > 0) && (
              <button
                onClick={handleResetForm}
                className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-800 font-bold bg-purple-50 px-2 py-1 rounded"
              >
                <PlusCircle className="w-3 h-3" /> {txt.newRule}
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder={txt.ruleNamePlaceholder}
              className="flex-1 border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            />
            <button
              onClick={() => handleSaveRule()}
              disabled={!customPrompt.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded shadow disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
            >
              {selectedRuleId ? txt.btnUpdateRule : txt.btnSaveRule}
            </button>
          </div>
        </div>

        {/* Saved Rules List */}
        {savedRules.length > 0 && (
          <div className="mb-6 flex-1 min-h-0 flex flex-col">
            <h4 className="text-sm font-bold text-gray-700 mb-2">{txt.savedRulesTitle}</h4>
            <div className="space-y-2 overflow-y-auto pr-1 max-h-40 border border-gray-100 rounded p-1">
              {savedRules.map(rule => {
                const isChecked = checkedRuleIds.includes(rule.id);
                const isEditing = selectedRuleId === rule.id;
                return (
                  <div
                    key={rule.id}
                    onClick={() => handleToggleRule(rule)}
                    className={`flex items-center justify-between p-2 rounded border group cursor-pointer transition-all ${isEditing
                        ? 'bg-purple-100 border-purple-400 ring-1 ring-purple-400'
                        : isChecked
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-gray-200 hover:border-purple-300'
                      }`}
                  >
                    <div className="p-2 text-gray-500 hover:text-blue-600">
                      {isChecked ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                    </div>
                    <span className={`flex-1 text-sm font-medium truncate select-none ${isChecked ? 'text-blue-800 font-bold' : 'text-gray-700'}`}>
                      {rule.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleSelectRuleForEdit(e, rule)}
                        className={`p-2 rounded-full hover:bg-purple-100 transition-colors ${isEditing ? 'text-purple-600 bg-purple-100' : 'text-gray-400'}`}
                        title="Edit/Update"
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
          </div>
        )}

        {/* Import / Export Rules Footer */}
        <div className="flex justify-between items-center pt-2 pb-4 border-b border-gray-100 mb-4">
          <div className="text-xs text-gray-400 font-bold uppercase tracking-wide">Rule Options</div>
          <div className="flex gap-2">
            <button onClick={handleExportRules} disabled={savedRules.length === 0} className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-700 px-2 py-1 bg-gray-100 rounded disabled:opacity-50">
              <Download className="w-3 h-3" /> JSON Export
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-700 px-2 py-1 bg-gray-100 rounded">
              <Upload className="w-3 h-3" /> JSON Import
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportRules} />
          </div>
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