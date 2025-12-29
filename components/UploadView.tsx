import React, { useRef, useState, useEffect, useMemo } from 'react';
import { TRANS } from '../utils/translations';
import { PhotoRecord, AppMode, SortPolicy, LogEntry } from '../types';
import { Upload, FileUp, HardHat, Trash2, Settings, History, FileText, FolderTree, MoreVertical, Activity } from 'lucide-react';
import { estimateQuickCost } from '../services/usageTracker';
import { getSelectedModel, setSelectedModel, ModelType } from '../services/geminiService';
import ConsolePanel from './ConsolePanel';
import CostEstimationPanel from './CostEstimationPanel';
import { loadRuleSettings, saveRuleSettings, RuleSettings } from '../utils/analysisRules';

interface UploadViewProps {
  lang: 'en' | 'ja';
  isProcessing: boolean;
  photos: PhotoRecord[];
  appMode: AppMode;
  apiKey: string;
  logs: LogEntry[];
  isAskingAI?: boolean;
  setAppMode: (mode: AppMode) => void;
  onStartProcessing: (files: File[], instruction: string, useCache: boolean, sortPolicy: SortPolicy) => void;
  onResume: () => void;
  onCloseProject: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPdfButtonClick?: () => void;
  onClearCache?: () => void;
  onShowPreview?: () => void;
  onOpenSettings?: () => void;
  onManualPairing?: (files: File[], instruction: string) => void;
  onShowHistory?: () => void;
  onOpenMasterEditor?: () => void;
  onOpenHealthDashboard?: () => void;
  onAskAI?: (prompt: string) => Promise<string>;
  onClearLogs?: () => void;
}

const STORAGE_KEY_INSTRUCTION = 'gemini_last_upload_instruction';

// Header button component to reduce duplication
const HeaderButton: React.FC<{
  onClick?: () => void;
  icon: React.ReactNode;
  label?: string;
  title?: string;
  className?: string;
  badge?: React.ReactNode;
}> = ({ onClick, icon, label, title, className = 'bg-gray-100 hover:bg-gray-200 text-gray-600', badge }) => (
  <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${className}`} title={title}>
    {icon}
    {label && <span className="hidden sm:inline text-xs font-medium">{label}</span>}
    {badge}
  </button>
);

const UploadView: React.FC<UploadViewProps> = ({
  lang, isProcessing, photos, appMode, apiKey, logs, isAskingAI,
  setAppMode, onStartProcessing, onResume, onCloseProject, onExportJson, onImportJson,
  onPdfButtonClick, onClearCache, onShowPreview, onOpenSettings, onManualPairing,
  onShowHistory, onOpenMasterEditor, onOpenHealthDashboard, onAskAI, onClearLogs
}) => {
  const txt = TRANS[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputImportRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [useCache, setUseCache] = useState(true);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [selectedModelLocal, setSelectedModelLocal] = useState<ModelType>(getSelectedModel());
  const [sortPolicy, setSortPolicy] = useState<SortPolicy>('by_detail_safety_first');
  const [ruleSettings, setRuleSettings] = useState<RuleSettings>(loadRuleSettings());
  const [showMenu, setShowMenu] = useState(false);
  const [showConsole, setShowConsole] = useState(false);

  const handleRuleSettingsChange = (newSettings: RuleSettings) => {
    setRuleSettings(newSettings);
    saveRuleSettings(newSettings);
  };

  const costEstimate = useMemo(() => {
    if (!pendingFiles || pendingFiles.length === 0) return null;
    return estimateQuickCost(pendingFiles.length);
  }, [pendingFiles]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_INSTRUCTION);
    if (saved) setInstruction(saved);
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY_INSTRUCTION, instruction); }, [instruction]);

  useEffect(() => {
    if (showMenu) {
      const handleClickOutside = () => setShowMenu(false);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMenu]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); if (!isProcessing && apiKey) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isProcessing && apiKey && e.dataTransfer.files?.length) setPendingFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) setPendingFiles(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmStart = () => {
    if (pendingFiles?.length) {
      setSelectedModel(selectedModelLocal);
      onStartProcessing(pendingFiles, instruction, useCache, sortPolicy);
      setPendingFiles(null);
    }
  };

  const handleClick = () => {
    if (!isProcessing && apiKey) fileInputRef.current?.click();
    else if (!apiKey) onOpenSettings?.();
  };

  const handleSendInstruction = async (prompt: string) => {
    if (onAskAI) {
      try { await onAskAI(prompt); } catch (err) { console.error('AI request failed:', err); }
    }
  };

  const menuItems = [
    { label: 'Backup (JSON)', icon: '💾', onClick: onExportJson },
    { label: 'Restore (JSON)', icon: '📂', onClick: () => fileInputImportRef.current?.click() },
    ...(onPdfButtonClick ? [{ label: 'Load PDF', icon: <FileText className="w-4 h-4" />, onClick: onPdfButtonClick }] : []),
    { divider: true },
    ...(onClearCache ? [{ label: 'Clear Cache', icon: <Trash2 className="w-4 h-4" />, onClick: onClearCache, danger: true }] : []),
  ].filter(Boolean);

  return (
    <div
      className={`min-h-screen w-full flex flex-col transition-colors duration-300 relative ${isDragging ? 'bg-blue-50' : 'bg-white'} ${showConsole ? 'pb-[25vh]' : ''}`}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center z-10">
        <h1 className="text-gray-700 font-bold tracking-tight text-xl flex items-center gap-2">
          {appMode === 'construction' ? <HardHat className="w-6 h-6 text-amber-500" /> : <FileUp className="w-5 h-5" />}
          {txt.appTitle}
        </h1>
        <div className="flex items-center gap-2">
          {photos.length > 0 && (
            <button onClick={onResume} className="flex items-center gap-1.5 px-3 py-2 bg-green-100 hover:bg-green-200 rounded-lg text-sm text-green-700 transition-colors font-medium">
              <span className="text-xs">📋</span>{txt.resumeLabel}
            </button>
          )}
          {onOpenMasterEditor && <HeaderButton onClick={onOpenMasterEditor} icon={<FolderTree className="w-4 h-4" />} label="マスタ" title="マスタ設定" />}
          {onOpenHealthDashboard && <HeaderButton onClick={onOpenHealthDashboard} icon={<Activity className="w-4 h-4" />} label="Health" title="コードベース健全性ダッシュボード" className="bg-blue-100 hover:bg-blue-200 text-blue-600" />}
          {onShowHistory && <HeaderButton onClick={onShowHistory} icon={<History className="w-4 h-4" />} label="履歴" title="解析履歴" className="bg-purple-100 hover:bg-purple-200 text-purple-600" />}
          <HeaderButton
            onClick={onOpenSettings}
            icon={<Settings className="w-4 h-4" />}
            label={apiKey ? getSelectedModel() : 'キー未設定'}
            title={apiKey ? "API設定" : "APIキーを設定してください"}
            className={apiKey ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-red-100 hover:bg-red-200 text-red-600'}
            badge={!apiKey && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />}
          />
          {/* 3-dot Menu */}
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="flex items-center justify-center w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="その他">
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                {menuItems.map((item, i) => 'divider' in item ? (
                  <div key={i} className="border-t border-gray-100 my-1" />
                ) : (
                  <button key={i} onClick={() => { item.onClick?.(); setShowMenu(false); }} className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'}`}>
                    <span>{item.icon}</span> {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Interaction Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative w-full max-w-2xl mx-auto px-4">
        <div onClick={handleClick} className="group cursor-pointer flex flex-col items-center justify-center p-10 md:p-16 z-20 rounded-3xl transition-all duration-300 hover:bg-gray-50 w-full">
          <div className={`mb-6 transition-transform duration-300 ease-out p-6 rounded-full bg-gray-100 group-hover:bg-blue-100 group-hover:scale-110 ${isDragging ? 'scale-125 bg-blue-200' : ''}`}>
            <Upload className={`w-16 h-16 text-gray-400 group-hover:text-blue-600 transition-colors ${isDragging ? 'text-blue-600' : ''}`} strokeWidth={1.5} />
          </div>
          <span className="text-2xl md:text-3xl font-bold text-gray-700 group-hover:text-gray-900 transition-colors tracking-tight text-center">
            {isDragging ? txt.dropHere : txt.putPhotos}
          </span>
          <span className="mt-3 text-sm text-gray-400 group-hover:text-gray-500 text-center">
            {appMode === 'construction' ? '工事黒板を自動認識します' : 'Click or Drop photos here'}
          </span>
          <input type="file" ref={fileInputRef} onChange={handleFileInputChange} className="hidden" multiple accept="image/*" />
        </div>

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="absolute inset-0 bg-white/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm rounded-xl">
            <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-6" />
            <h2 className="text-xl font-bold text-gray-800 animate-pulse">{txt.analyzing}</h2>
            <p className="text-gray-500 mt-2 text-sm">AI is processing your photos...</p>
            {onShowPreview && <button onClick={onShowPreview} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm">Show Preview</button>}
          </div>
        )}

        {/* Cost Estimation Panel */}
        {pendingFiles && costEstimate && (
          <CostEstimationPanel
            pendingFiles={pendingFiles}
            costEstimate={costEstimate}
            selectedModel={selectedModelLocal}
            sortPolicy={sortPolicy}
            useCache={useCache}
            ruleSettings={ruleSettings}
            onModelChange={setSelectedModelLocal}
            onSortPolicyChange={setSortPolicy}
            onUseCacheChange={setUseCache}
            onRuleSettingsChange={handleRuleSettingsChange}
            onCancel={() => setPendingFiles(null)}
            onTestOne={() => {
              if (pendingFiles?.length) {
                setSelectedModel(selectedModelLocal);
                onStartProcessing([pendingFiles[0]], instruction, useCache, sortPolicy);
              }
            }}
            onStartAll={handleConfirmStart}
            onManualPairing={onManualPairing ? () => { onManualPairing(pendingFiles, instruction); setPendingFiles(null); } : undefined}
          />
        )}
      </div>

      <input type="file" ref={fileInputImportRef} onChange={onImportJson} className="hidden" accept=".json" />
      <ConsolePanel logs={logs} isOpen={showConsole} onToggle={() => setShowConsole(!showConsole)} onClear={onClearLogs || (() => {})} isProcessing={isAskingAI} onSendInstruction={onAskAI ? handleSendInstruction : undefined} />
    </div>
  );
};

export default UploadView;
