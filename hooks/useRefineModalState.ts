import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnalysisRule, getRules, saveRule, deleteRule, exportRulesToJson, importRulesFromJson } from '../utils/storage';
import { PhotoRecord } from '../types';

const STORAGE_KEY_PROMPT = 'gemini_last_refine_prompt';

const PRESET_RULES: Partial<AnalysisRule>[] = [
  { name: "安全管理重点 (Safety Focus)", instruction: "Describe safety measures in detail. Mention safety cones, helmets, barricades, and signage visible in the 'Description' field.", tags: ["安全", "保安", "Safety"] },
  { name: "機材・機械抽出 (Equipment List)", instruction: "List all construction machinery (excavators, rollers, dump trucks) visible in the photo in the 'Description' or 'Remarks'.", tags: ["機械", "重機", "Equipment"] },
  { name: "黒板情報厳守 (Strict Blackboard)", instruction: "Do NOT infer Station or Work Type from visual context. Only extract text that is clearly legible on the blackboard. If illegible, leave blank.", tags: ["黒板", "OCR", "Strict"] },
  { name: "英語出力 (English Output)", instruction: "Translate all output fields (Work Type, Remarks, Description) into English.", tags: ["翻訳", "English"] }
];

export function useRefineModalState(photos: PhotoRecord[], lang: 'en' | 'ja') {
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

  const getContextText = useCallback(() => photos.map(p =>
    `${p.fileName} ${p.analysis?.workType || ''} ${p.analysis?.remarks || ''} ${p.analysis?.description || ''}`
  ).join(' ').toLowerCase(), [photos]);

  const getMatchingRuleIds = useCallback((rules: AnalysisRule[], contextText: string) =>
    rules.filter(r => r.tags?.some(tag => tag.trim().toLowerCase() && contextText.includes(tag.trim().toLowerCase()))).map(r => r.id), []);

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
  }, [getContextText, getMatchingRuleIds]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY_PROMPT, customPrompt); }, [customPrompt]);

  const resetForm = useCallback(() => {
    setCustomPrompt(""); setRuleName(""); setRuleTags("");
    setSelectedRuleId(null); setCheckedRuleIds([]); setAutoMatchedCount(0);
  }, []);

  const handleSaveRule = useCallback(async (autoName?: string) => {
    const promptToSave = customPrompt.trim();
    const nameToSave = ruleName.trim() || autoName;
    if (!promptToSave || !nameToSave) return;

    const tagsArray = ruleTags.split(/,|、/).map(t => t.trim()).filter(Boolean);
    const id = selectedRuleId || Date.now().toString();
    const newRule: AnalysisRule = { id, name: nameToSave, instruction: promptToSave, tags: tagsArray };

    await saveRule(newRule);
    setSavedRules(prev => selectedRuleId ? prev.map(r => r.id === selectedRuleId ? newRule : r) : [...prev, newRule]);
    resetForm();
  }, [customPrompt, ruleName, ruleTags, selectedRuleId, resetForm]);

  const handleDeleteRule = useCallback(async (id: string) => {
    await deleteRule(id);
    setSavedRules(prev => prev.filter(r => r.id !== id));
    if (selectedRuleId === id) resetForm();
    setCheckedRuleIds(prev => prev.filter(cid => cid !== id));
  }, [selectedRuleId, resetForm]);

  const handleLoadPresets = useCallback(async () => {
    if (!confirm(lang === 'ja' ? "おすすめルールを追加しますか？" : "Add recommended rules?")) return;
    for (const preset of PRESET_RULES) {
      if (!savedRules.some(r => r.name === preset.name)) {
        await saveRule({ id: Date.now().toString() + Math.random().toString().slice(2, 5), name: preset.name!, instruction: preset.instruction!, tags: preset.tags });
      }
    }
    setSavedRules(await getRules());
  }, [lang, savedRules]);

  const handleToggleRule = useCallback((rule: AnalysisRule) => {
    const isChecked = checkedRuleIds.includes(rule.id);
    const newCheckedIds = isChecked ? checkedRuleIds.filter(id => id !== rule.id) : [...checkedRuleIds, rule.id];
    let newPrompt = isChecked
      ? customPrompt.replace(rule.instruction, "").trim()
      : (customPrompt ? customPrompt + "\n\n" + rule.instruction : rule.instruction);
    setCheckedRuleIds(newCheckedIds);
    setCustomPrompt(newPrompt.replace(/\n{3,}/g, '\n\n').trim());
    if (selectedRuleId && selectedRuleId !== rule.id) resetForm();
  }, [checkedRuleIds, customPrompt, selectedRuleId, resetForm]);

  const handleSelectRuleForEdit = useCallback((e: React.MouseEvent, rule: AnalysisRule) => {
    e.stopPropagation();
    setCheckedRuleIds([]);
    setCustomPrompt(rule.instruction);
    setRuleName(rule.name);
    setRuleTags(rule.tags?.join(", ") || "");
    setSelectedRuleId(rule.id);
  }, []);

  const handleExportRules = useCallback(() => {
    if (savedRules.length === 0) return;
    const blob = new Blob([exportRulesToJson(savedRules)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `construction_ai_rules_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [savedRules]);

  const handleImportRules = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [lang]);

  const triggerImport = useCallback(() => fileInputRef.current?.click(), []);

  const filteredRules = savedRules.filter(r =>
    !searchTerm || r.name.toLowerCase().includes(searchTerm.toLowerCase()) || r.tags?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return {
    customPrompt, setCustomPrompt, ruleName, setRuleName, ruleTags, setRuleTags,
    selectedRuleId, checkedRuleIds, savedRules, batchSize, setBatchSize,
    autoMatchedCount, searchTerm, setSearchTerm, fileInputRef, filteredRules,
    resetForm, handleSaveRule, handleDeleteRule, handleLoadPresets,
    handleToggleRule, handleSelectRuleForEdit, handleExportRules, handleImportRules, triggerImport,
  };
}
