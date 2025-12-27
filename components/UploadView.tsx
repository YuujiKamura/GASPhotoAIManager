import React, { useRef, useState, useEffect, useMemo } from 'react';
import { TRANS } from '../utils/translations';
import { PhotoRecord, AppMode, SortPolicy, SORT_POLICIES } from '../types';
import { Upload, FileUp, HardHat, Camera, MessageSquare, Trash2, Database, AlertCircle, Coins, X, Play, Settings, MousePointer, ArrowUpDown } from 'lucide-react';
import { estimateQuickCost, formatCostJPY } from '../services/usageTracker';
import { getSelectedModel, setSelectedModel, AVAILABLE_MODELS, ModelType } from '../services/geminiService';

interface UploadViewProps {
  lang: 'en' | 'ja';
  isProcessing: boolean;
  photos: PhotoRecord[];
  appMode: AppMode;
  apiKey: string; // Only for checking availability
  setAppMode: (mode: AppMode) => void;
  onStartProcessing: (files: File[], instruction: string, useCache: boolean, sortPolicy: SortPolicy) => void;
  onResume: () => void;
  onCloseProject: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearCache?: () => void;
  onShowPreview?: () => void;
  onOpenSettings?: () => void;
  onManualPairing?: (files: File[], instruction: string) => void;
}

const STORAGE_KEY_INSTRUCTION = 'gemini_last_upload_instruction';

const UploadView: React.FC<UploadViewProps> = ({
  lang,
  isProcessing,
  photos,
  appMode,
  apiKey,
  setAppMode,
  onStartProcessing,
  onResume,
  onCloseProject,
  onExportJson,
  onImportJson,
  onClearCache,
  onShowPreview,
  onOpenSettings,
  onManualPairing
}) => {
  const txt = TRANS[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputImportRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [useCache, setUseCache] = useState(true); // Default to True
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null); // 確認待ちファイル
  const [selectedModelLocal, setSelectedModelLocal] = useState<ModelType>(getSelectedModel());
  const [sortPolicy, setSortPolicy] = useState<SortPolicy>('chronological');

  // コスト見積もり
  const costEstimate = useMemo(() => {
    if (!pendingFiles || pendingFiles.length === 0) return null;
    return estimateQuickCost(pendingFiles.length);
  }, [pendingFiles]);

  // Restore instruction from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_INSTRUCTION);
    if (saved) {
      setInstruction(saved);
    }
  }, []);

  // Save instruction to local storage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_INSTRUCTION, instruction);
  }, [instruction]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing && apiKey) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing || !apiKey) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // 確認画面を表示
      setPendingFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // 確認画面を表示
      setPendingFiles(Array.from(e.target.files));
    }
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 解析を開始
  const handleConfirmStart = () => {
    if (pendingFiles && pendingFiles.length > 0) {
      setSelectedModel(selectedModelLocal); // モデル設定を保存
      onStartProcessing(pendingFiles, instruction, useCache, sortPolicy);
      setPendingFiles(null);
    }
  };

  // キャンセル
  const handleCancelPending = () => {
    setPendingFiles(null);
  };

  const handleClick = () => {
    if (!isProcessing && apiKey) {
      fileInputRef.current?.click();
    } else if (!apiKey) {
      alert("API Key is missing. Please configure it in your environment.");
    }
  };

  return (
    <div
      className={`min-h-screen w-full flex flex-col transition-colors duration-300 relative
        ${isDragging ? 'bg-blue-50' : 'bg-white'}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* --- HEADER --- */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10">
        <h1 className="text-gray-700 font-bold tracking-tight text-xl flex items-center gap-2">
          {appMode === 'construction' ? <HardHat className="w-6 h-6 text-amber-500" /> : <FileUp className="w-5 h-5" />}
          {txt.appTitle}
        </h1>
        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 transition-colors"
          title="API設定"
        >
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline text-xs font-medium">{getSelectedModel()}</span>
        </button>
      </div>

      {/* --- MAIN INTERACTION AREA --- */}
      <div className="flex-1 flex flex-col items-center justify-center relative w-full max-w-2xl mx-auto px-4">

        {/* The Trigger */}
        <div
            onClick={handleClick}
            className="group cursor-pointer flex flex-col items-center justify-center p-10 md:p-16 z-20 rounded-3xl transition-all duration-300 hover:bg-gray-50 w-full"
        >
          {/* ICON CONTAINER */}
          <div className={`mb-6 transition-transform duration-300 ease-out p-6 rounded-full bg-gray-100 group-hover:bg-blue-100 group-hover:scale-110 ${isDragging ? 'scale-125 bg-blue-200' : ''}`}>
            <Upload
              className={`w-16 h-16 text-gray-400 group-hover:text-blue-600 transition-colors ${isDragging ? 'text-blue-600' : ''}`}
              strokeWidth={1.5}
            />
          </div>

          {/* MAIN TEXT */}
          <span className="text-2xl md:text-3xl font-bold text-gray-700 group-hover:text-gray-900 transition-colors tracking-tight text-center">
            {isDragging ? txt.dropHere : txt.putPhotos}
          </span>
          <span className="mt-3 text-sm text-gray-400 group-hover:text-gray-500 text-center">
            {appMode === 'construction' ? '工事黒板を自動認識します' : 'Click or Drop photos here'}
          </span>

          {/* HIDDEN INPUT */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            className="hidden"
            multiple
            accept="image/*"
          />
        </div>

        {/* --- SETTINGS / INSTRUCTION INPUT --- */}
        {apiKey && (
          <div className="w-full max-w-md mt-6 z-20 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-3">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 pt-3 pointer-events-none">
                <MessageSquare className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onClick={(e) => e.stopPropagation()} // Prevent triggering upload
                placeholder={lang === 'ja'
                  ? "AIへの指示（任意）: 例「工種は全て『舗装工』にして」「場所は東京駅」"
                  : "Custom Instruction (Optional): e.g., 'Categorize all as Kitchen'"}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl leading-5 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm resize-none shadow-sm transition-shadow h-20"
              />
            </div>
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="absolute inset-0 bg-white/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm rounded-xl">
            <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-6"></div>
            <h2 className="text-xl font-bold text-gray-800 animate-pulse">{txt.analyzing}</h2>
            <p className="text-gray-500 mt-2 text-sm">AI is processing your photos...</p>
            {onShowPreview && (
              <button
                onClick={onShowPreview}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm"
              >
                Show Preview
              </button>
            )}
          </div>
        )}

        {/* Cost Estimation Confirmation Panel */}
        {pendingFiles && costEstimate && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5" />
                  <h3 className="font-bold text-lg">コスト見積もり</h3>
                </div>
                <button
                  onClick={handleCancelPending}
                  className="p-1 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                {/* File Info */}
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <span className="text-gray-600">選択された画像</span>
                  <span className="font-bold text-gray-800">{pendingFiles.length}枚</span>
                </div>

                {/* Cost Estimate */}
                <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      <span className="font-bold">推定APIコスト</span>
                      <p className="text-xs mt-1 text-yellow-700">
                        実際のコストは写真の内容により変動します
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">最小</span>
                      <span className="font-mono text-gray-800">
                        ${costEstimate.min.toFixed(4)} ({formatCostJPY(costEstimate.min)})
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-gray-700">典型的</span>
                      <span className="font-mono text-blue-600">
                        ${costEstimate.typical.toFixed(4)} ({formatCostJPY(costEstimate.typical)})
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">最大</span>
                      <span className="font-mono text-gray-800">
                        ${costEstimate.max.toFixed(4)} ({formatCostJPY(costEstimate.max)})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Settings Section */}
                <div className="space-y-3 border-t border-gray-200 pt-4">
                  {/* Model Selection */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1.5 block">使用モデル</label>
                    <div className="grid grid-cols-3 gap-2">
                      {AVAILABLE_MODELS.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => setSelectedModelLocal(model.id)}
                          className={`p-2 rounded-lg border text-xs transition-all ${
                            selectedModelLocal === model.id
                              ? 'bg-blue-50 border-blue-500 text-blue-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <div className="font-medium truncate">{model.name.replace('Gemini ', '')}</div>
                          <div className="text-[10px] text-gray-400 truncate">{model.description.split('（')[0]}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sort Policy Selection */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1.5 block flex items-center gap-1">
                      <ArrowUpDown className="w-3 h-3" />
                      並び替え
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {SORT_POLICIES.map((policy) => (
                        <button
                          key={policy.id}
                          onClick={() => setSortPolicy(policy.id)}
                          className={`p-2 rounded-lg border text-xs text-left transition-all ${
                            sortPolicy === policy.id
                              ? 'bg-purple-50 border-purple-500 text-purple-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <div className="font-medium">{policy.name}</div>
                          <div className="text-[10px] text-gray-400">{policy.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cache Toggle */}
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-700">キャッシュを使用</span>
                    </div>
                    <button
                      onClick={() => setUseCache(!useCache)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        useCache ? 'bg-blue-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          useCache ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                  {useCache && (
                    <p className="text-[10px] text-green-600 pl-1">
                      解析済みの写真はスキップしてAPI消費を抑えます
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 p-4 bg-gray-50 border-t border-gray-100">
                <div className="flex gap-3">
                  <button
                    onClick={handleCancelPending}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleConfirmStart}
                    className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    AI解析
                  </button>
                </div>
                {onManualPairing && (
                  <button
                    onClick={() => {
                      if (pendingFiles) {
                        onManualPairing(pendingFiles, instruction);
                        setPendingFiles(null);
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <MousePointer className="w-4 h-4" />
                    手動ペアリング（AI解析スキップ）
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* --- FOOTER (Data Management) --- */}
      <div className="absolute bottom-0 w-full p-6 flex justify-between items-end z-10 text-xs font-medium text-gray-400">

        {/* Mode Switcher */}
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={(e) => { e.stopPropagation(); setAppMode('construction'); }}
            className={`px-3 py-1.5 rounded flex items-center gap-2 transition-all ${appMode === 'construction' ? 'bg-white text-gray-800 shadow-sm font-bold' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <HardHat className="w-3 h-3" /> {txt.modeConstruction}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setAppMode('general'); }}
            className={`px-3 py-1.5 rounded flex items-center gap-2 transition-all ${appMode === 'general' ? 'bg-white text-gray-800 shadow-sm font-bold' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Camera className="w-3 h-3" /> {txt.modeGeneral}
          </button>
        </div>

        <div className="flex gap-4 items-center">
          {photos.length > 0 && (
            <button onClick={onResume} className="hover:text-gray-800 transition-colors border-b border-transparent hover:border-gray-800 pb-0.5">
              {txt.resumeLabel}
            </button>
          )}
          <span className="w-px bg-gray-300 mx-1 h-4"></span>
          <button onClick={onExportJson} className="hover:text-gray-800 transition-colors">
            Backup (JSON)
          </button>
          <button onClick={() => fileInputImportRef.current?.click()} className="hover:text-gray-800 transition-colors">
            Restore (JSON)
          </button>
          {onClearCache && (
            <>
              <span className="w-px bg-gray-300 mx-1 h-4"></span>
              <button onClick={onClearCache} className="hover:text-red-600 transition-colors flex items-center gap-1" title="Delete stored AI analysis results">
                <Trash2 className="w-3 h-3" /> Clear Cache
              </button>
            </>
          )}
          <input type="file" ref={fileInputImportRef} onChange={onImportJson} className="hidden" accept=".json" />
        </div>
      </div>

    </div>
  );
};

export default UploadView;