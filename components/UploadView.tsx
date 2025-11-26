

import React, { useRef, useState } from 'react';
import { TRANS } from '../utils/translations';
import { PhotoRecord, AppMode } from '../types';
import { Upload, FileUp, HardHat, Camera, MessageSquare, Trash2 } from 'lucide-react';

interface UploadViewProps {
  lang: 'en' | 'ja';
  isProcessing: boolean;
  photos: PhotoRecord[];
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  onStartProcessing: (files: File[], instruction: string) => void;
  onResume: () => void;
  onCloseProject: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearCache?: () => void;
}

const UploadView: React.FC<UploadViewProps> = ({
  lang,
  isProcessing,
  photos,
  appMode,
  setAppMode,
  onStartProcessing,
  onResume,
  onCloseProject,
  onExportJson,
  onImportJson,
  onClearCache
}) => {
  const txt = TRANS[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputImportRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState("");

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onStartProcessing(Array.from(e.dataTransfer.files), instruction);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onStartProcessing(Array.from(e.target.files), instruction);
    }
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClick = () => {
    if (!isProcessing) {
      fileInputRef.current?.click();
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
          Photo Archive AI
        </h1>
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

        {/* --- CUSTOM INSTRUCTION INPUT --- */}
        <div className="w-full max-w-md mt-4 z-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
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

        {/* Processing Indicator */}
        {isProcessing && (
           <div className="absolute inset-0 bg-white/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm rounded-xl">
              <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-6"></div>
              <h2 className="text-xl font-bold text-gray-800 animate-pulse">{txt.analyzing}</h2>
              <p className="text-gray-500 mt-2 text-sm">AI is processing your photos...</p>
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