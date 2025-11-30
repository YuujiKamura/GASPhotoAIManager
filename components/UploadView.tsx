import React, { useRef, useState, useEffect } from 'react';
import { TRANS } from '../utils/translations';
import { PhotoRecord, AppMode } from '../types';
import { Upload, FileUp, HardHat, Camera, MessageSquare, Trash2, Key, Check, Database, Zap } from 'lucide-react';

interface UploadViewProps {
  lang: 'en' | 'ja';
  isProcessing: boolean;
  photos: PhotoRecord[];
  appMode: AppMode;
  apiKey: string;
  setApiKey: (key: string) => void;
  setAppMode: (mode: AppMode) => void;
  onStartProcessing: (files: File[], instruction: string, useCache: boolean) => void;
  onResume: () => void;
  onCloseProject: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearCache?: () => void;
  onShowPreview?: () => void;
}

const STORAGE_KEY_INSTRUCTION = 'gemini_last_upload_instruction';

const UploadView: React.FC<UploadViewProps> = ({
  lang,
  isProcessing,
  photos,
  appMode,
  apiKey,
  setApiKey,
  setAppMode,
  onStartProcessing,
  onResume,
  onCloseProject,
  onExportJson,
  onImportJson,
  onClearCache,
  onShowPreview
}) => {
  const txt = TRANS[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputImportRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(!apiKey);
  const [useCache, setUseCache] = useState(true); // Default to True

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
      onStartProcessing(Array.from(e.dataTransfer.files), instruction, useCache);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onStartProcessing(Array.from(e.target.files), instruction, useCache);
    }
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClick = () => {
    if (!isProcessing && apiKey) {
      fileInputRef.current?.click();
    }
  };

  const handleKeySave = () => {
    if (apiKey.trim()) {
      setShowKeyInput(false);
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
        <button
          onClick={() => setShowKeyInput(!showKeyInput)}
          className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${!apiKey ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-500 hover:text-gray-900'}`}
        >
          <Key className="w-4 h-4" />
          {apiKey ? "API Key Set" : "Set API Key"}
        </button>
      </div>

      {/* --- MAIN INTERACTION AREA --- */}
      <div className="flex-1 flex flex-col items-center justify-center relative w-full max-w-2xl mx-auto px-4">

        {showKeyInput || !apiKey ? (
          <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100 animate-in fade-in zoom-in duration-300 z-30">
            <div className="flex flex-col items-center mb-6">
              <div className="bg-amber-100 p-3 rounded-full mb-3">
                <Key className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Gemini API Key Required</h2>
              <p className="text-gray-500 text-center text-sm mt-2">
                This app requires a Google Gemini API Key to analyze photos. <br />
                The key is stored locally in your browser.
              </p>
            </div>
            <div className="space-y-4">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API Key here (AIza...)"
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-amber-500 outline-none font-mono text-sm"
              />
              <button
                onClick={handleKeySave}
                disabled={!apiKey.trim()}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-lg shadow disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" /> Save & Continue
              </button>
              <div className="text-center">
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
                  Get an API Key from Google AI Studio
                </a>
              </div>
            </div>
          </div>
        ) : (
          /* The Trigger */
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
        )}

        {/* --- SETTINGS / INSTRUCTION INPUT --- */}
        {!showKeyInput && apiKey && (
          <div className="w-full max-w-md mt-6 z-20 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-3">
            {/* Use Cache Checkbox */}
            <div
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-white transition-colors group"
              onClick={() => setUseCache(!useCache)}
            >
              <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${useCache ? 'bg-green-600 border-green-600' : 'bg-white border-gray-400'}`}>
                {useCache && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-700 select-none flex items-center gap-2">
                  <Database className="w-4 h-4 text-green-600" />
                  {lang === 'ja' ? 'キャッシュを利用（高速化）' : 'Use Cache (Restore previous)'}
                </span>
                <span className="text-[10px] text-gray-400 pl-6">
                  {lang === 'ja' ? '解析済みの写真を復元し、API消費を抑えます' : 'Restore analyzed photos to save API quota'}
                </span>
              </div>
            </div>

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