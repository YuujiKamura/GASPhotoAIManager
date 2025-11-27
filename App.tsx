import React, { useState, useEffect } from 'react';
import { PhotoRecord, ProcessingStats, AIAnalysisResult, AppMode, LogEntry } from './types';
import { processImageForAI, getPhotoDate } from './utils/imageUtils';
import { analyzePhotoBatch, identifyTargetPhotos } from './services/geminiService';
import { generateExcel } from './utils/excelGenerator';
import { saveProjectData, loadProjectData, clearProjectData, getCachedAnalysis, cacheAnalysis, exportDataToJson, importDataFromJson, clearAnalysisCache } from './utils/storage';
import { TRANS } from './utils/translations';

// Components
import UploadView from './components/UploadView';
import PreviewView from './components/PreviewView';
import LimitModal from './components/LimitModal';
import RefineModal from './components/RefineModal';

// Declare saveAs for export
declare const saveAs: any;

const DEFAULT_BATCH_SIZE = 3; // Reverted to 3 for better RPM/Quota efficiency
const MAX_PHOTOS = 30; 

type PendingFile = { file: File, date: number };

export default function App() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [stats, setStats] = useState<ProcessingStats>({ total: 0, processed: 0, success: 0, failed: 0, cached: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>('construction');
  
  // Console Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // Modals
  const [pendingFiles, setPendingFiles] = useState<PendingFile[] | null>(null);
  const [selectionStart, setSelectionStart] = useState(1);
  const [selectionCount, setSelectionCount] = useState(MAX_PHOTOS);
  const [showRefineModal, setShowRefineModal] = useState(false);
  // Store initial instruction if files are pending selection
  const [pendingInstruction, setPendingInstruction] = useState<string>("");

  // Language
  const [lang, setLang] = useState<'en' | 'ja'>('en');
  const txt = TRANS[lang];

  // Detect Language
  useEffect(() => {
    if (navigator.language.startsWith('ja')) setLang('ja');
  }, []);

  // Load data
  useEffect(() => {
    const initLoad = async () => {
      try {
        const savedPhotos = await loadProjectData();
        if (savedPhotos && savedPhotos.length > 0) {
          setPhotos(savedPhotos);
          const success = savedPhotos.filter(p => p.status === 'done').length;
          const failed = savedPhotos.filter(p => p.status === 'error').length;
          const cached = savedPhotos.filter(p => p.fromCache).length;
          setStats({ total: savedPhotos.length, processed: success + failed, success, failed, cached });
          setShowPreview(true); // Restore view if data exists
        }
      } catch (err) {
        console.error("Failed to load session", err);
      } finally {
        setIsStorageLoaded(true);
      }
    };
    initLoad();
  }, []);

  // Auto-Save
  useEffect(() => {
    if (!isStorageLoaded) return;
    const timer = setTimeout(() => {
      if (photos.length > 0) {
        saveProjectData(photos).catch(console.error);
      }
    }, 500); // Reduced to 500ms for snappier saves
    return () => clearTimeout(timer);
  }, [photos, isStorageLoaded]);

  // --- Helpers ---
  
  const addLog = (message: string, type: LogEntry['type'] = 'info', details?: any) => {
    const timestamp = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    setLogs(prev => [...prev, { timestamp, message, type, details }]);
  };

  const clearLogs = () => setLogs([]);

  // --- Logic Controllers ---

  const handleCloseProject = async () => {
    if (window.confirm(txt.resetConfirm)) {
      setPhotos([]);
      setStats({ total: 0, processed: 0, success: 0, failed: 0, cached: 0 });
      setErrorMsg(null);
      setSuccessMsg(null);
      setShowPreview(false);
      setPendingFiles(null);
      clearLogs();
      await clearProjectData();
    }
  };

  const handleClearCache = async () => {
    const msg = lang === 'ja' 
      ? "解析済みのキャッシュデータを削除しますか？\n（現在表示中のデータは消えませんが、次回以降の解析でAPIが使用されます）" 
      : "Clear analysis cache?\n(Current view is not affected, but next analysis will use API)";
      
    if (window.confirm(msg)) {
      await clearAnalysisCache();
      setStats(prev => ({ ...prev, cached: 0 }));
      setPhotos(prev => prev.map(p => ({ ...p, fromCache: false })));
      alert(lang === 'ja' ? "キャッシュを削除しました。" : "Cache cleared.");
      addLog("Cache cleared by user.", 'info');
    }
  };

  const handleDeletePhoto = (fileName: string) => {
    if (window.confirm(lang === 'ja' ? "この写真を削除してもよろしいですか？" : "Are you sure you want to delete this photo?")) {
      const updatedPhotos = photos.filter(p => p.fileName !== fileName);
      setPhotos(updatedPhotos);
      
      // Re-calculate stats
      const success = updatedPhotos.filter(p => p.status === 'done').length;
      const failed = updatedPhotos.filter(p => p.status === 'error').length;
      const cached = updatedPhotos.filter(p => p.fromCache).length;
      setStats({ total: updatedPhotos.length, processed: success + failed, success, failed, cached });
      addLog(`Deleted photo: ${fileName}`, 'info');
    }
  };

  const handleUpdatePhoto = (fileName: string, field: keyof AIAnalysisResult, value: string) => {
    setPhotos(prev => prev.map(p => {
      if (p.fileName === fileName && p.analysis) {
        return {
          ...p,
          analysis: { ...p.analysis, [field]: value }
        };
      }
      return p;
    }));
  };

  const handleResume = () => {
    setShowPreview(true);
  };

  const handleStartProcessing = async (files: File[], instruction: string) => {
    const enrichedFiles: PendingFile[] = await Promise.all(files.map(async f => ({
      file: f,
      date: await getPhotoDate(f)
    })));

    enrichedFiles.sort((a, b) => a.date - b.date);

    if (enrichedFiles.length > MAX_PHOTOS) {
      setPendingFiles(enrichedFiles);
      setPendingInstruction(instruction);
      setSelectionCount(MAX_PHOTOS);
      setSelectionStart(1);
    } else {
      startAnalysisPipeline(enrichedFiles, instruction);
    }
  };

  const handleConfirmLimit = () => {
    if (!pendingFiles) return;
    const startIndex = Math.max(0, selectionStart - 1);
    const selected = pendingFiles.slice(startIndex, startIndex + selectionCount);
    setPendingFiles(null);
    startAnalysisPipeline(selected, pendingInstruction);
  };

  const startAnalysisPipeline = async (filesWithDate: PendingFile[], instruction: string) => {
    setIsProcessing(true);
    setShowPreview(true);
    setErrorMsg(null);
    setCurrentStep(txt.analyzing);
    clearLogs();
    addLog(`Starting analysis for ${filesWithDate.length} photos...`, 'info');

    // 1. Create Records & Check Cache
    const initialRecords: PhotoRecord[] = [];
    let cachedCount = 0;

    for (const item of filesWithDate) {
       const { base64, mimeType } = await processImageForAI(item.file);
       
       // Create temp record for cache lookup
       const tempRecord: PhotoRecord = {
         fileName: item.file.name,
         originalFile: item.file,
         base64: "", // Don't use heavy base64 for key if file obj works
         mimeType,
         fileSize: item.file.size,
         lastModified: item.file.lastModified,
         date: item.date,
         status: 'pending'
       };

       const cached = await getCachedAnalysis(tempRecord);
       
       if (cached) {
         cachedCount++;
         addLog(`Cache hit for ${item.file.name}`, 'success');
       }

       initialRecords.push({
         ...tempRecord,
         base64, // Restore base64
         analysis: cached || undefined,
         status: cached ? 'done' : 'pending',
         fromCache: !!cached
       });
    }

    setPhotos(initialRecords);
    setStats({ 
       total: initialRecords.length, 
       processed: cachedCount, 
       success: cachedCount, 
       failed: 0, 
       cached: cachedCount 
    });

    // 2. Identify Pending
    const pendingRecords = initialRecords.filter(r => r.status === 'pending');

    if (pendingRecords.length === 0) {
       setIsProcessing(false);
       setSuccessMsg(lang === 'ja' ? "キャッシュからすべて復元しました。" : "All restored from cache.");
       addLog("All items restored from cache. No API calls needed.", 'success');
       return;
    }

    // 3. Run Analysis on Pending
    runAnalysis(initialRecords, instruction, pendingRecords);
  };

  const handleRefineAnalysis = async (instruction: string, batchSize: number) => {
    setIsProcessing(true);
    setErrorMsg(null);
    addLog(`Refining analysis with instruction: "${instruction}"`, 'info');
    
    // Identify targets?
    setCurrentStep(txt.identifyingTargets);
    const targetFilenames = await identifyTargetPhotos(photos, instruction);
    addLog(`Targeted ${targetFilenames.length} photos for refinement.`, 'info', targetFilenames);
    
    if (targetFilenames.length === 0) {
      setIsProcessing(false);
      alert(lang === 'ja' ? "対象となる写真が見つかりませんでした。" : "No matching photos found.");
      return;
    }

    // Reset status for targets
    const updatedPhotos = photos.map(p => {
       if (targetFilenames.includes(p.fileName)) {
         return { ...p, status: 'pending' as const }; // force re-process
       }
       return p;
    });
    setPhotos(updatedPhotos);

    // Filter pending
    const pending = updatedPhotos.filter(p => p.status === 'pending');
    runAnalysis(updatedPhotos, instruction, pending, batchSize);
    setShowRefineModal(false);
  };

  const runAnalysis = async (
    allPhotos: PhotoRecord[], 
    instruction: string, 
    pendingSubset: PhotoRecord[],
    batchSize: number = DEFAULT_BATCH_SIZE
  ) => {
    let currentPhotos = [...allPhotos];
    let processedCount = stats.processed;
    let successCount = stats.success;
    let failedCount = stats.failed;

    // Split pending into batches
    for (let i = 0; i < pendingSubset.length; i += batchSize) {
       const batch = pendingSubset.slice(i, i + batchSize);
       setCurrentStep(`${txt.analyzing} (${i + 1}/${pendingSubset.length})`);
       
       addLog(`Processing batch ${Math.floor(i/batchSize) + 1} (${batch.length} photos)...`, 'info');

       try {
         // Update Status to Processing
         currentPhotos = currentPhotos.map(p => batch.find(b => b.fileName === p.fileName) ? { ...p, status: 'processing' } : p);
         setPhotos(currentPhotos);

         const results = await analyzePhotoBatch(batch, instruction, batchSize, appMode, addLog);

         // Apply Results
         results.forEach(res => {
            currentPhotos = currentPhotos.map(p => {
               if (p.fileName === res.fileName) {
                 // Save to Cache
                 cacheAnalysis(p, res);
                 return { ...p, analysis: res, status: 'done', fromCache: false };
               }
               return p;
            });
         });

         // Mark any in batch that didn't get a result as error
         const batchFilenames = batch.map(b => b.fileName);
         const resultFilenames = results.map(r => r.fileName);
         const missing = batchFilenames.filter(f => !resultFilenames.includes(f));
         
         if (missing.length > 0) {
            currentPhotos = currentPhotos.map(p => missing.includes(p.fileName) ? { ...p, status: 'error' } : p);
            failedCount += missing.length;
            addLog(`Failed to get results for: ${missing.join(', ')}`, 'error');
         }

         successCount += results.length;
         processedCount += batch.length;

         setPhotos([...currentPhotos]); // Trigger update
         setStats(prev => ({ ...prev, processed: processedCount, success: successCount, failed: failedCount }));

         // Pause between batches
         if (i + batchSize < pendingSubset.length) {
            addLog("Pausing for 3s to respect API limits...", 'info');
            await new Promise(r => setTimeout(r, 3000)); // 3s delay for safe RPM
         }

       } catch (e: any) {
         console.error("Batch failed", e);
         const isQuota = e.message?.includes("429");
         
         // Mark batch as error
         currentPhotos = currentPhotos.map(p => batch.find(b => b.fileName === p.fileName) ? { ...p, status: 'error' } : p);
         failedCount += batch.length;
         processedCount += batch.length;
         setPhotos([...currentPhotos]);
         setStats(prev => ({ ...prev, processed: processedCount, failed: failedCount }));
         
         if (isQuota) {
            setErrorMsg(lang === 'ja' ? "API制限に達しました。しばらく待ってから再試行してください。" : "API Rate Limit Exceeded. Please wait.");
            addLog("Processing stopped due to Rate Limit.", 'error');
            setIsProcessing(false);
            return; // Stop processing loop
         }
       }
    }

    setIsProcessing(false);
    setCurrentStep("");
    addLog("Analysis pipeline completed.", 'success');
  };

  const handleExportJson = () => {
    const json = exportDataToJson(photos);
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, `photo_project_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = importDataFromJson(ev.target?.result as string);
        setPhotos(data);
        const success = data.filter(p => p.status === 'done').length;
        const failed = data.filter(p => p.status === 'error').length;
        const cached = data.filter(p => p.fromCache).length;
        setStats({ total: data.length, processed: success + failed, success, failed, cached });
        setShowPreview(true);
        addLog(`Imported ${data.length} records from JSON.`, 'success');
      } catch (err) {
        alert("Failed to import JSON.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      {showPreview ? (
        <PreviewView 
          lang={lang}
          photos={photos}
          stats={stats}
          appMode={appMode}
          isProcessing={isProcessing}
          currentStep={currentStep}
          errorMsg={errorMsg}
          successMsg={successMsg}
          logs={logs}
          onClearLogs={clearLogs}
          onGoHome={() => setShowPreview(false)}
          onCloseProject={handleCloseProject}
          onRefine={() => setShowRefineModal(true)}
          onExportExcel={() => generateExcel(photos, appMode)}
          onUpdatePhoto={handleUpdatePhoto}
          onDeletePhoto={handleDeletePhoto}
        />
      ) : (
        <UploadView 
          lang={lang}
          isProcessing={isProcessing}
          photos={photos}
          appMode={appMode}
          setAppMode={setAppMode}
          onStartProcessing={handleStartProcessing}
          onResume={handleResume}
          onCloseProject={handleCloseProject}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onClearCache={handleClearCache}
        />
      )}

      {pendingFiles && (
        <LimitModal 
          totalFiles={pendingFiles.length}
          maxPhotos={MAX_PHOTOS}
          selectionStart={selectionStart}
          selectionCount={selectionCount}
          lang={lang}
          onStartChange={setSelectionStart}
          onCountChange={setSelectionCount}
          onCancel={() => setPendingFiles(null)}
          onConfirm={handleConfirmLimit}
        />
      )}

      {showRefineModal && (
        <RefineModal 
          lang={lang}
          photos={photos}
          onClose={() => setShowRefineModal(false)}
          onRunAnalysis={handleRefineAnalysis}
        />
      )}
    </>
  );
}