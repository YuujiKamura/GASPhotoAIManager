
import React, { useState, useEffect } from 'react';
import { PhotoRecord, ProcessingStats, AIAnalysisResult } from './types';
import { processImageForAI, getPhotoDate } from './utils/imageUtils';
import { analyzePhotoBatch } from './services/geminiService';
import { generateExcel } from './utils/excelGenerator';
import { saveProjectData, loadProjectData, clearProjectData, getCachedAnalysis, cacheAnalysis, exportDataToJson, importDataFromJson } from './utils/storage';
import { TRANS } from './utils/translations';

// Components
import UploadView from './components/UploadView';
import PreviewView from './components/PreviewView';
import LimitModal from './components/LimitModal';
import RefineModal from './components/RefineModal';

// Declare saveAs for export
declare const saveAs: any;

const BATCH_SIZE = 6; // Reduced from 15 to 6 for stability
const MAX_PHOTOS = 30;

type PendingFile = { file: File, date: number };

export default function App() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [stats, setStats] = useState<ProcessingStats>({ total: 0, processed: 0, success: 0, failed: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  // Modals
  const [pendingFiles, setPendingFiles] = useState<PendingFile[] | null>(null);
  const [selectionStart, setSelectionStart] = useState(1);
  const [selectionCount, setSelectionCount] = useState(MAX_PHOTOS);
  const [showRefineModal, setShowRefineModal] = useState(false);

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
          setStats({ total: savedPhotos.length, processed: success + failed, success, failed });
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
    }, 1000);
    return () => clearTimeout(timer);
  }, [photos, isStorageLoaded]);

  // --- Logic Controllers ---

  const handleCloseProject = async () => {
    if (window.confirm(txt.resetConfirm)) {
      setPhotos([]);
      setStats({ total: 0, processed: 0, success: 0, failed: 0 });
      setErrorMsg(null);
      setSuccessMsg(null);
      setShowPreview(false);
      setPendingFiles(null);
      await clearProjectData();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setPendingFiles(null);
    setIsProcessing(true);
    setCurrentStep("Sorting...");

    const fileList = Array.from(e.target.files) as File[];
    const imageFiles = fileList.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      setErrorMsg(txt.noImages);
      setIsProcessing(false);
      return;
    }

    const filesWithDate = await Promise.all(imageFiles.map(async (file) => {
      const date = await getPhotoDate(file);
      return { file, date };
    }));

    filesWithDate.sort((a, b) => a.date - b.date);

    if (filesWithDate.length > MAX_PHOTOS) {
      setIsProcessing(false);
      setCurrentStep("");
      setPendingFiles(filesWithDate);
      setSelectionStart(1);
      setSelectionCount(MAX_PHOTOS);
      return;
    }

    startProcessing(filesWithDate);
  };

  const handleSelectionConfirm = () => {
    if (!pendingFiles) return;
    const startIdx = Math.max(0, selectionStart - 1);
    const endIdx = Math.min(pendingFiles.length, startIdx + selectionCount);
    const selectedFiles = pendingFiles.slice(startIdx, endIdx);
    setPendingFiles(null);
    startProcessing(selectedFiles);
  };

  const startProcessing = async (filesToProcess: PendingFile[]) => {
    setIsProcessing(true);
    setCurrentStep("Checking cache...");

    const newRecords: PhotoRecord[] = [];
    let cachedCount = 0;

    for (const { file } of filesToProcess) {
      try {
        const { base64, mimeType } = await processImageForAI(file);
        const cachedResult = await getCachedAnalysis(file);
        if (cachedResult) {
          cachedCount++;
          newRecords.push({
            fileName: file.name,
            originalFile: file,
            base64,
            mimeType,
            status: 'done',
            analysis: cachedResult
          });
        } else {
          newRecords.push({
            fileName: file.name,
            originalFile: file,
            base64,
            mimeType,
            status: 'pending'
          });
        }
      } catch (err) {
        console.error(`Failed to load ${file.name}`, err);
      }
    }

    await clearProjectData();
    setPhotos(newRecords);

    if (cachedCount > 0) {
      setSuccessMsg(txt.cacheHit(cachedCount));
    }

    setShowPreview(true);
    runAnalysis(newRecords);
  };

  const runAnalysis = async (specificPhotos?: PhotoRecord[], customInstruction?: string, batchSize: number = 6) => {
    if (!process.env.API_KEY) {
      setErrorMsg("Gemini API Key is missing.");
      return;
    }

    const currentPhotos = specificPhotos || photos;
    if (currentPhotos.length === 0) return;

    setIsProcessing(true);

    // Determine targets: Retry all if Custom Instruction, else only pending
    let targetPhotos: PhotoRecord[];
    if (customInstruction) {
      targetPhotos = currentPhotos.filter(p => p.status !== 'error');
    } else {
      targetPhotos = currentPhotos.filter(p => p.status === 'pending');
    }

    if (targetPhotos.length === 0) {
      setIsProcessing(false);
      setCurrentStep("Analysis Complete");
      return;
    }

    // Reset stats
    if (customInstruction) {
      setStats({ total: currentPhotos.length, processed: 0, success: 0, failed: 0 });
    } else {
      const alreadyDone = currentPhotos.length - targetPhotos.length;
      setStats({ total: currentPhotos.length, processed: alreadyDone, success: alreadyDone, failed: 0 });
    }

    let updatedPhotos = [...currentPhotos];

    const updatePhotoStatus = (fileName: string, status: PhotoRecord['status'], analysis?: AIAnalysisResult) => {
      const idx = updatedPhotos.findIndex(p => p.fileName === fileName);
      if (idx !== -1) {
        updatedPhotos[idx] = { ...updatedPhotos[idx], status, analysis };
      }
    };

    try {
      for (let i = 0; i < targetPhotos.length; i += batchSize) {
        const batch = targetPhotos.slice(i, i + batchSize);
        setCurrentStep(`AI Analyzing... ${i + 1}/${targetPhotos.length}`);

        try {
          batch.forEach(p => updatePhotoStatus(p.fileName, 'processing'));
          setPhotos([...updatedPhotos]);

          const results = await analyzePhotoBatch(batch, customInstruction);

          await Promise.all(batch.map(async (photo, idx) => {
            const result = results.find(r => r.fileName === photo.fileName) || results[idx];
            if (result) {
              updatePhotoStatus(photo.fileName, 'done', result);
              setStats(prev => ({ ...prev, processed: prev.processed + 1, success: prev.success + 1 }));
              if (photo.originalFile) await cacheAnalysis(photo.originalFile, result);
            } else {
              updatePhotoStatus(photo.fileName, 'error');
              setStats(prev => ({ ...prev, processed: prev.processed + 1, failed: prev.failed + 1 }));
            }
          }));

        } catch (err: any) {
          console.error("Batch failed", err);
          const errorMsgStr = (err.message || JSON.stringify(err) || "").toString();
          if (errorMsgStr.includes("403") || errorMsgStr.includes("PERMISSION_DENIED")) {
            setErrorMsg(txt.permissionError);
            throw new Error("PERMISSION_DENIED");
          }
          batch.forEach(p => updatePhotoStatus(p.fileName, 'error'));
          setStats(prev => ({ ...prev, processed: prev.processed + batch.length, failed: prev.failed + batch.length }));
        }
        setPhotos([...updatedPhotos]);
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e: any) {
      if (!e.message.includes("PERMISSION_DENIED")) setErrorMsg(`API Error: ${e.message}`);
    } finally {
      setIsProcessing(false);
      setCurrentStep("Analysis Complete");
    }
  };

  // --- Handlers for Import/Export ---
  const handleExportJson = () => {
    const jsonStr = exportDataToJson(photos);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    saveAs(blob, `construction_backup_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const importedData = importDataFromJson(ev.target?.result as string);
        await clearProjectData();
        setPhotos(importedData);
        setSuccessMsg("Imported successfully!");
        setShowPreview(true);
        const success = importedData.filter(p => p.status === 'done').length;
        setStats({ total: importedData.length, processed: importedData.length, success, failed: importedData.length - success });
      } catch (err) {
        setErrorMsg("Invalid JSON format.");
      }
    };
    reader.readAsText(file);
  };

  const handleRefineRun = (instruction: string, batchSize: number) => {
    setShowRefineModal(false);
    runAnalysis(undefined, instruction, batchSize);
  };

  return (
    <>
      {/* Modal: Limit Selection */}
      {pendingFiles && (
        <LimitModal
          lang={lang}
          totalFiles={pendingFiles.length}
          maxPhotos={MAX_PHOTOS}
          selectionStart={selectionStart}
          selectionCount={selectionCount}
          onStartChange={setSelectionStart}
          onCountChange={setSelectionCount}
          onCancel={() => setPendingFiles(null)}
          onConfirm={handleSelectionConfirm}
        />
      )}

      {/* Modal: Refine Rules */}
      {showRefineModal && (
        <RefineModal
          lang={lang}
          onClose={() => setShowRefineModal(false)}
          onRunAnalysis={handleRefineRun}
        />
      )}

      {/* Main Content / Preview Switcher */}
      {showPreview ? (
        <PreviewView
          lang={lang}
          photos={photos}
          stats={stats}
          isProcessing={isProcessing}
          currentStep={currentStep}
          errorMsg={errorMsg}
          successMsg={successMsg}
          onGoHome={() => setShowPreview(false)}
          onCloseProject={handleCloseProject}
          onRefine={() => setShowRefineModal(true)}
          onExportExcel={() => generateExcel(photos)}
        />
      ) : (
        <UploadView
          lang={lang}
          isProcessing={isProcessing}
          photos={photos}
          onFileSelect={handleFileSelect}
          onResume={() => setShowPreview(true)}
          onCloseProject={handleCloseProject}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
        />
      )}
    </>
  );
}