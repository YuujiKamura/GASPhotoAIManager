import React, { useRef } from 'react';
import { Upload, FileImage, Loader2, Smartphone, X, FileJson, ArrowUpFromLine } from 'lucide-react';
import { TRANS } from '../utils/translations';
import { PhotoRecord } from '../types';

interface UploadViewProps {
  lang: 'en' | 'ja';
  isProcessing: boolean;
  photos: PhotoRecord[];
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResume: () => void;
  onCloseProject: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const UploadView: React.FC<UploadViewProps> = ({
  lang,
  isProcessing,
  photos,
  onFileSelect,
  onResume,
  onCloseProject,
  onExportJson,
  onImportJson
}) => {
  const txt = TRANS[lang];
  const fileInputFolderRef = useRef<HTMLInputElement>(null);
  const fileInputMobileRef = useRef<HTMLInputElement>(null);
  const fileInputImportRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`min-h-screen flex flex-col bg-gray-50 text-slate-800 app-ui`}>
      <header className="bg-slate-800 text-white shadow-md p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-lg"><FileImage className="w-6 h-6 text-white" /></div>
            <h1 className="text-xl font-bold tracking-wide">{txt.appTitle}</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg border border-gray-200 p-10 text-center">
           <div className="mb-8">
             <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
               <Upload className="w-10 h-10 text-blue-600" />
             </div>
             <h2 className="text-2xl font-bold text-gray-900 mb-2">{txt.uploadTitle}</h2>
             <p className="text-gray-500">{txt.uploadDesc}</p>
           </div>

           <div className="flex flex-col gap-4 items-center w-full">
             <button onClick={() => fileInputFolderRef.current?.click()} disabled={isProcessing} className="w-full sm:w-auto min-w-[280px] flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-md">
               {isProcessing ? <Loader2 className="w-6 h-6 animate-spin"/> : <FileImage className="w-6 h-6" />} {txt.btnPC}
             </button>
             <input type="file" ref={fileInputFolderRef} className="hidden" multiple onChange={onFileSelect} {...({ webkitdirectory: "", directory: "" } as any)}/>

             <button onClick={() => fileInputMobileRef.current?.click()} disabled={isProcessing} className="w-full sm:w-auto min-w-[280px] flex items-center justify-center gap-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-sm">
               {isProcessing ? <Loader2 className="w-6 h-6 animate-spin"/> : <Smartphone className="w-6 h-6" />} {txt.btnMobile}
             </button>
             <input type="file" ref={fileInputMobileRef} className="hidden" multiple accept="image/*" onChange={onFileSelect} />
           </div>

           {/* Resume Session Block */}
           {photos.length > 0 && (
              <div className="mt-8 pt-8 border-t border-gray-100 w-full">
                <p className="text-gray-400 text-sm mb-4">{txt.resumeLabel} ({photos.length} photos)</p>
                <div className="flex gap-4 justify-center">
                  <button onClick={onResume} className="bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 px-6 py-2 rounded-lg font-bold shadow-sm transition-all">{txt.resumeBtn}</button>
                  <button onClick={onCloseProject} className="bg-white border border-red-200 text-red-600 hover:bg-red-50 px-6 py-2 rounded-lg font-bold shadow-sm transition-all flex items-center gap-2">
                    <X className="w-4 h-4" /> {txt.clearBtn}
                  </button>
                </div>
              </div>
           )}

           {/* Data Management Block */}
           <div className="mt-12 pt-8 border-t border-dashed border-gray-200 w-full">
              <h3 className="text-gray-500 font-bold text-sm mb-4 uppercase tracking-wider">{txt.dataMgmt}</h3>
              <div className="flex gap-4 justify-center flex-wrap">
                 <button onClick={onExportJson} disabled={photos.length === 0} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                   <FileJson className="w-4 h-4" /> {txt.exportJson}
                 </button>
                 <button onClick={() => fileInputImportRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold transition-all">
                   <ArrowUpFromLine className="w-4 h-4" /> {txt.importJson}
                 </button>
                 <input type="file" ref={fileInputImportRef} className="hidden" accept=".json" onChange={onImportJson} />
              </div>
           </div>
        </div>
      </main>
    </div>
  );
};

export default UploadView;