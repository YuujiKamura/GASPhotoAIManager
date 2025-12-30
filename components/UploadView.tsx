import React from 'react';
import { TRANS } from '../utils/translations';
import { PhotoRecord, AppMode, SortPolicy, LogEntry } from '../types';
import { Upload, FileUp, HardHat, Trash2, Settings, History, FileText, FolderTree, MoreVertical, Activity, Brain } from 'lucide-react';
import { getSelectedModel } from '../services/geminiService';
import { useUploadViewState } from '../hooks/useUploadViewState';
import ConsolePanel from './ConsolePanel';
import AnalysisSetupModal from './AnalysisSetupModal';

// --- Grouped interfaces ---

/** Core data props */
interface UploadData {
  lang: 'en' | 'ja';
  photos: PhotoRecord[];
  appMode: AppMode;
  apiKey: string;
  logs: LogEntry[];
}

/** Processing state */
interface UploadState {
  isProcessing: boolean;
  isAskingAI?: boolean;
}

/** Core action handlers */
interface CoreHandlers {
  setAppMode: (mode: AppMode) => void;
  onStartProcessing: (files: File[], sortPolicy: SortPolicy, useCache: boolean) => void;
  onResume: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Optional feature handlers */
interface FeatureHandlers {
  onPdfButtonClick?: () => void;
  onClearCache?: () => void;
  onShowPreview?: () => void;
  onOpenSettings?: () => void;
  onManualPairing?: (files: File[]) => void;
  onShowHistory?: () => void;
  onOpenMasterEditor?: () => void;
  onOpenHealthDashboard?: () => void;
  onOpenAIFramework?: () => void;
  onAskAI?: (prompt: string) => Promise<string>;
  onClearLogs?: () => void;
  onTestOneInteractive?: (file: File) => void;
}

// Main props interface
export interface UploadViewProps {
  data: UploadData;
  state: UploadState;
  coreHandlers: CoreHandlers;
  featureHandlers: FeatureHandlers;
}

// Header button component
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
  data: { lang, photos, appMode, apiKey, logs },
  state: { isProcessing, isAskingAI },
  coreHandlers: { setAppMode, onStartProcessing, onResume, onExportJson, onImportJson },
  featureHandlers: { onPdfButtonClick, onClearCache, onShowPreview, onOpenSettings, onManualPairing, onShowHistory, onOpenMasterEditor, onOpenHealthDashboard, onOpenAIFramework, onAskAI, onClearLogs, onTestOneInteractive }
}) => {
  const txt = TRANS[lang];
  const { refs, state: viewState, handlers } = useUploadViewState(isProcessing);

  const handleSendInstruction = async (prompt: string) => {
    if (onAskAI) {
      try { await onAskAI(prompt); } catch (err) { console.error('AI request failed:', err); }
    }
  };

  const menuItems = [
    ...(onOpenSettings ? [{ label: apiKey ? `API設定 (${getSelectedModel()})` : 'API設定 (未設定)', icon: <Settings className="w-4 h-4" />, onClick: onOpenSettings, warning: !apiKey }] : []),
    ...(onOpenMasterEditor ? [{ label: 'マスタ管理', icon: <FolderTree className="w-4 h-4" />, onClick: onOpenMasterEditor }] : []),
    { divider: true },
    ...(onOpenHealthDashboard ? [{ label: 'Health Dashboard', icon: <Activity className="w-4 h-4" />, onClick: onOpenHealthDashboard }] : []),
    ...(onOpenAIFramework ? [{ label: 'AI Framework', icon: <Brain className="w-4 h-4" />, onClick: onOpenAIFramework }] : []),
    { divider: true },
    { label: 'Backup (JSON)', icon: '💾', onClick: onExportJson },
    { label: 'Restore (JSON)', icon: '📂', onClick: handlers.triggerImportClick },
    ...(onPdfButtonClick ? [{ label: 'Load PDF', icon: <FileText className="w-4 h-4" />, onClick: onPdfButtonClick }] : []),
    { divider: true },
    ...(onClearCache ? [{ label: 'Clear Cache', icon: <Trash2 className="w-4 h-4" />, onClick: onClearCache, danger: true }] : []),
  ].filter(Boolean);

  return (
    <div
      className={`min-h-screen w-full flex flex-col transition-colors duration-300 relative ${viewState.isDragging ? 'bg-blue-50' : 'bg-white'} ${viewState.showConsole ? 'pb-[25vh]' : ''}`}
      onDragOver={handlers.handleDragOver} onDragLeave={handlers.handleDragLeave} onDrop={handlers.handleDrop}
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
          {onShowHistory && <HeaderButton onClick={onShowHistory} icon={<History className="w-4 h-4" />} label="履歴" title="解析履歴" className="bg-indigo-100 hover:bg-indigo-200 text-indigo-600" />}
          {/* 3-dot Menu */}
          <div className="relative">
            <button type="button" onClick={handlers.toggleMenu} className="flex items-center justify-center w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="その他">
              <MoreVertical className="w-5 h-5" />
            </button>
            {viewState.showMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                {menuItems.map((item, i) => 'divider' in item ? (
                  <div key={i} className="border-t border-gray-100 my-1" />
                ) : (
                  <button type="button" key={i} onClick={(e) => { e.preventDefault(); item.onClick?.(); handlers.closeMenu(); }} className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${item.danger ? 'text-red-600 hover:bg-red-50' : item.warning ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-700 hover:bg-gray-100'}`}>
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
        <div onClick={handlers.handleClick} className="group cursor-pointer flex flex-col items-center justify-center p-10 md:p-16 z-20 rounded-3xl transition-all duration-300 hover:bg-gray-50 w-full">
          <div className={`mb-6 transition-transform duration-300 ease-out p-6 rounded-full bg-gray-100 group-hover:bg-blue-100 group-hover:scale-110 ${viewState.isDragging ? 'scale-125 bg-blue-200' : ''}`}>
            <Upload className={`w-16 h-16 text-gray-400 group-hover:text-blue-600 transition-colors ${viewState.isDragging ? 'text-blue-600' : ''}`} strokeWidth={1.5} />
          </div>
          <span className="text-2xl md:text-3xl font-bold text-gray-700 group-hover:text-gray-900 transition-colors tracking-tight text-center">
            {viewState.isDragging ? txt.dropHere : txt.putPhotos}
          </span>
          <span className="mt-3 text-sm text-gray-400 group-hover:text-gray-500 text-center">
            {appMode === 'construction' ? '工事黒板を自動認識します' : 'Click or Drop photos here'}
          </span>
          <input type="file" ref={refs.fileInputRef} onChange={handlers.handleFileInputChange} className="hidden" multiple accept="image/*" />
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

        {/* Analysis Setup Modal */}
        {viewState.pendingFiles && viewState.pendingFiles.length > 0 && (
          <AnalysisSetupModal
            files={viewState.pendingFiles}
            lang={lang}
            apiKey={apiKey}
            onCancel={handlers.clearPendingFiles}
            onStartAnalysis={(files, sortPolicy, useCache) => {
              onStartProcessing(files, sortPolicy, useCache);
              handlers.clearPendingFiles();
            }}
            onManualPairing={onManualPairing ? (files) => { onManualPairing(files); handlers.clearPendingFiles(); } : undefined}
            onInteractiveTest={(file) => onTestOneInteractive?.(file)}
            onOpenMasterEditor={() => onOpenMasterEditor?.()}
            onOpenSettings={onOpenSettings}
          />
        )}
      </div>

      <input type="file" ref={refs.fileInputImportRef} onChange={onImportJson} className="hidden" accept=".json" />
      <ConsolePanel logs={logs} isOpen={viewState.showConsole} onToggle={handlers.toggleConsole} onClear={onClearLogs || (() => {})} isProcessing={isAskingAI} onSendInstruction={onAskAI ? handleSendInstruction : undefined} />
    </div>
  );
};

export default UploadView;
