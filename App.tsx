
import React, { useState, useEffect } from 'react';
import { PhotoRecord, ProcessingStats, AIAnalysisResult, AppMode, LogEntry } from './types';
import { processImageForAI, getPhotoDate } from './utils/imageUtils';
import { analyzePhotoBatch, identifyTargetPhotos, normalizeDataConsistency, assignSceneIds, refinePairContext } from './services/geminiService';
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

const DEFAULT_BATCH_SIZE = 3; 
const MAX_PHOTOS = 30; 
const LOCAL_STORAGE_KEY = 'gemini_api_key';

type PendingFile = { file: File, date: number };

export default function App() {
  // API Key Management: Env -> LocalStorage -> Empty
  const [apiKey, setApiKey] = useState<string>(() => {
    return process.env.API_KEY || localStorage.getItem(LOCAL_STORAGE_KEY) || "";
  });

  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [stats, setStats] = useState<ProcessingStats>({ total: 0, processed: 0, success: 0, failed: 0, cached: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>('construction');
  const [initialLayout, setInitialLayout] = useState<2 | 3>(3); // Default to 3-up
  
  // Console Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // Modals
  const [pendingFiles, setPendingFiles] = useState<PendingFile[] | null>(null);
  const [selectionStart, setSelectionStart] = useState(1);
  const [selectionCount, setSelectionCount] = useState(MAX_PHOTOS);
  const [showRefineModal, setShowRefineModal] = useState(false);
  // Store initial instruction if files are pending selection
  const [pendingInstruction, setPendingInstruction] = useState<string>("");
  const [pendingUseCache, setPendingUseCache] = useState<boolean>(true);

  // Language
  const [lang, setLang] = useState<'en' | 'ja'>('en');
  const txt = TRANS[lang];

  // Detect Language
  useEffect(() => {
    if (navigator.language.startsWith('ja')) setLang('ja');
  }, []);

  // Save API Key to local storage when updated
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem(LOCAL_STORAGE_KEY, apiKey);
    }
  }, [apiKey]);

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
          addLog("Restored previous session data.", 'success');
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
        // Track which fields are manually edited
        const editedFields = p.analysis.editedFields ? [...p.analysis.editedFields] : [];
        if (!editedFields.includes(field as string)) {
          editedFields.push(field as string);
        }

        const updatedAnalysis: AIAnalysisResult = { 
          ...p.analysis, 
          [field]: value,
          editedFields: editedFields 
        };
        
        // Update persistent cache immediately so future loads reflect manual edits
        cacheAnalysis(p, updatedAnalysis).catch(e => console.error("Cache update failed", e));
        
        return {
          ...p,
          analysis: updatedAnalysis
        };
      }
      return p;
    }));
  };

  const handleResume = () => {
    setShowPreview(true);
  };

  // --- Sorting Logic ---

  const normalizeStationName = (raw: string | undefined): string => {
    if (!raw) return "";
    let s = raw.trim();
    if (!s) return "";
    s = s.replace(/[！-～]/g, r => String.fromCharCode(r.charCodeAt(0) - 0xFEE0));
    s = s.replace(/\s+/g, "");
    // Remove "No." "NO" prefixes to match just the number if possible, or normalize valid prefixes
    if (/^(no|number|nu|nm)[^a-z]/i.test(s)) {
       s = s.replace(/^(no|number|nu|nm)\.?/i, "No.");
    }
    return s.toUpperCase();
  };

  const getPhaseScore = (r: PhotoRecord): number => {
    // Use AI determined phase if available
    if (r.analysis?.phase === 'before') return 0;
    if (r.analysis?.phase === 'status') return 1;
    if (r.analysis?.phase === 'after') return 2;

    // Fallback to text heuristics
    const text = ((r.analysis?.remarks || "") + (r.analysis?.variety || "") + (r.analysis?.workType || "")).toLowerCase();
    if (text.includes("着手前") || text.includes("before") || text.includes("pre")) return 0;
    if (text.includes("完了") || text.includes("竣工") || text.includes("after") || text.includes("done")) return 2;
    return 1;
  };

  /**
   * Sorts photos based on Scene ID or Station.
   * This is the "Loose" sort used for initial display.
   */
  const sortPhotosLogical = (records: PhotoRecord[]): PhotoRecord[] => {
    const groups: { [key: string]: PhotoRecord[] } = {};
    const orphans: PhotoRecord[] = [];

    records.forEach(r => {
      let key = r.analysis?.sceneId;
      if (!key) {
        const station = normalizeStationName(r.analysis?.station);
        if (station && station !== "UNKNOWN") {
          key = "STATION_" + station;
        }
      }

      if (key) {
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      } else {
        orphans.push(r);
      }
    });

    const sortGroup = (group: PhotoRecord[]) => {
      return group.sort((a, b) => {
        const scoreA = getPhaseScore(a);
        const scoreB = getPhaseScore(b);
        if (scoreA !== scoreB) return scoreA - scoreB;
        return (a.date || 0) - (b.date || 0);
      });
    };

    Object.keys(groups).forEach(key => {
      groups[key] = sortGroup(groups[key]);
    });

    const groupKeys = Object.keys(groups).sort((keyA, keyB) => {
      const groupA = groups[keyA];
      const groupB = groups[keyB];
      const maxDateA = Math.max(...groupA.map(r => r.date || 0));
      const maxDateB = Math.max(...groupB.map(r => r.date || 0));
      return maxDateA - maxDateB;
    });

    const sorted: PhotoRecord[] = [];
    groupKeys.forEach(key => {
      sorted.push(...groups[key]);
    });
    sorted.push(...orphans.sort((a, b) => (a.date || 0) - (b.date || 0)));

    return sorted;
  };

  /**
   * STRICT Pairing for 2-up Layout.
   * Strategy:
   * 1. Group by SceneID/Station (Using Visual Anchors/Text).
   * 2. Within each group, sort by DATE.
   * 3. Take Earliest (Before) and Latest (After).
   * 4. OMIT anything else (middle photos, single photos).
   * 5. Return only the paired list.
   */
  const arrangePairsStrictly = (records: PhotoRecord[]): { sorted: PhotoRecord[], pairCount: number, omittedCount: number } => {
    const groups: { [key: string]: PhotoRecord[] } = {};
    let omittedCount = 0;

    // 1. Grouping
    records.forEach(r => {
      let key = r.analysis?.sceneId;
      if (!key) {
        const station = normalizeStationName(r.analysis?.station);
        if (station && station !== "UNKNOWN") key = "STATION_" + station;
      }

      if (key) {
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      } else {
        omittedCount++; // Orphans are omitted
      }
    });

    const pairedList: PhotoRecord[] = [];
    const groupKeys = Object.keys(groups);

    groupKeys.forEach(key => {
      const group = groups[key];
      
      // If less than 2 photos, we can't make a pair. Omit.
      if (group.length < 2) {
        omittedCount += group.length;
        return;
      }

      // Sort by Date Ascending
      group.sort((a, b) => (a.date || 0) - (b.date || 0));

      // STRICT PAIR: Earliest and Latest
      const beforePhoto = group[0];
      const afterPhoto = group[group.length - 1];

      // Any photos in between are omitted
      const middleCount = group.length - 2;
      if (middleCount > 0) omittedCount += middleCount;

      pairedList.push(beforePhoto);
      pairedList.push(afterPhoto);
    });

    // Sort the PAIRS by the date of their "After" photo (Construction Sequence)
    // We treat every 2 items as a pair block.
    // However, JS sort doesn't work on blocks. We can sort the pairedList logic if needed.
    // For now, let's keep it simple: The group processing order is random-ish, we should sort pairs.
    
    // We can't easily sort a flat list of pairs without grouping them back. 
    // Let's rely on the group iteration order? No, object keys are unordered.
    // Let's construct a tuple list, sort that, then flatten.
    
    const pairs: PhotoRecord[][] = [];
    for (let i = 0; i < pairedList.length; i += 2) {
      pairs.push([pairedList[i], pairedList[i+1]]);
    }

    pairs.sort((a, b) => {
      // Sort by the date of the "After" photo (index 1)
      const dateA = a[1].date || 0;
      const dateB = b[1].date || 0;
      return dateA - dateB;
    });

    const finalSort = pairs.flat();
    
    return { sorted: finalSort, pairCount: pairs.length, omittedCount };
  };

  /**
   * Hybrid Pairing with Persistence
   */
  const handleAutoPair = async () => {
    if (!apiKey) {
      alert(txt.permissionError);
      return;
    }
    
    setIsProcessing(true);
    setCurrentStep(txt.pairingProcessing);
    setInitialLayout(2); 

    try {
      const records = [...photos];
      
      // 1. Separate: Already Paired vs Needs Pairing
      const needsAI: PhotoRecord[] = [];
      const hasStation: PhotoRecord[] = [];
      const alreadyPaired: PhotoRecord[] = [];

      records.forEach(r => {
        if (r.analysis?.sceneId && r.analysis.sceneId.startsWith("AI_S")) {
           alreadyPaired.push(r); 
        } else {
           const station = normalizeStationName(r.analysis?.station);
           if (station && station !== "UNKNOWN") {
             hasStation.push(r);
           } else {
             needsAI.push(r);
           }
        }
      });

      // 2. Assign Logical IDs to Station photos (Instant)
      const updatedHasStation = hasStation.map(r => {
        const station = normalizeStationName(r.analysis?.station);
        // Force logical pairing based on station name equality
        return {
           ...r,
           analysis: {
             ...r.analysis!,
             sceneId: `LOGICAL_${station}`,
             // Phase is actually irrelevant for grouping in strict mode, but good for display
             phase: ((r.analysis?.remarks || "").includes("着手前") ? 'before' : (r.analysis?.remarks || "").includes("完了") ? 'after' : 'status') as any
           }
        };
      });

      // 3. Process Visual Candidates (AI)
      let updatedVisual: PhotoRecord[] = [...alreadyPaired];
      
      if (needsAI.length > 1) { 
         try {
           // Use Gemini 3 Pro to group by visual anchors
           const assignments = await assignSceneIds(needsAI, apiKey, addLog);
           const assignmentMap = new Map(assignments.map(a => [a.fileName, a]));
           
           const processedAI = needsAI.map(r => {
              const assign = assignmentMap.get(r.fileName);
              if (assign) {
                 return {
                    ...r,
                    analysis: {
                       ...r.analysis!,
                       sceneId: `AI_${assign.sceneId}`,
                       phase: assign.phase,
                       visualAnchors: assign.visualAnchors 
                    }
                 };
              }
              return r; 
           });
           
           updatedVisual = [...updatedVisual, ...processedAI];
           addLog(`Visual pairing created anchors for ${assignments.length} photos.`, 'success');

         } catch (e) {
           console.error("Visual pairing failed", e);
           addLog("Visual pairing failed - falling back to timestamp sort.", 'error');
           updatedVisual = [...updatedVisual, ...needsAI]; 
         }
      } else {
         updatedVisual = [...updatedVisual, ...needsAI];
      }

      // 4. Merge and Save to Cache
      const allUpdated = [...updatedHasStation, ...updatedVisual];
      
      allUpdated.forEach(r => {
         if (r.analysis) {
            cacheAnalysis(r, r.analysis).catch(console.error);
         }
      });

      // 5. STRICT SORTING for 2-up Layout (OMITTING UNPAIRED)
      const { sorted, pairCount, omittedCount } = arrangePairsStrictly(allUpdated);
      
      setPhotos(sorted);
      setSuccessMsg(lang === 'ja' 
        ? `${pairCount}箇所のペアを作成しました（${omittedCount}枚を除外）` 
        : `Created ${pairCount} pairs (Omitted ${omittedCount} photos)`);

    } catch (err: any) {
      console.error(err);
      setErrorMsg("Pairing failed: " + err.message);
      addLog("Pairing fatal error", 'error', err);
    } finally {
      setIsProcessing(false);
      setCurrentStep("");
    }
  };

  const handleSmartSort = () => {
    // Just sort by logical station/date without the strict pairing requirement
    const sorted = sortPhotosLogical([...photos]);
    setPhotos(sorted);
    setInitialLayout(2);
    setSuccessMsg(lang === 'ja' ? "測点・シーン情報に基づいて並び替えました" : "Sorted by Scene & Phase");
  };

  // --- Pipeline Steps ---

  const handleStartProcessing = async (files: File[], userInstruction: string, useCache: boolean) => {
    if (!files || files.length === 0) return;

    // 1. Initial Validation
    if (files.length > MAX_PHOTOS) {
      const pending: PendingFile[] = [];
      for (const f of files) {
        pending.push({ file: f, date: await getPhotoDate(f) });
      }
      pending.sort((a, b) => a.date - b.date);
      setPendingFiles(pending);
      setSelectionCount(Math.min(pending.length, MAX_PHOTOS));
      setPendingInstruction(userInstruction);
      setPendingUseCache(useCache);
      return;
    }

    setPendingInstruction(userInstruction);
    setPendingUseCache(useCache);
    await startAnalysisPipeline(files, userInstruction, useCache);
  };

  const confirmLimitSelection = () => {
    if (!pendingFiles) return;
    const startIndex = selectionStart - 1;
    const selected = pendingFiles.slice(startIndex, startIndex + selectionCount).map(p => p.file);
    setPendingFiles(null);
    startAnalysisPipeline(selected, pendingInstruction, pendingUseCache);
  };

  const startAnalysisPipeline = async (files: File[], instruction: string, useCache: boolean) => {
    setIsProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    clearLogs();

    try {
      // 1. Prepare Records & Check Cache
      setCurrentStep(lang === 'ja' ? "画像を準備中..." : "Preparing images...");
      
      const newRecords: PhotoRecord[] = [];
      let cachedCount = 0;

      for (const file of files) {
        const date = await getPhotoDate(file);
        const tempRecord: PhotoRecord = {
          fileName: file.name,
          base64: '', 
          mimeType: file.type,
          fileSize: file.size,
          lastModified: file.lastModified,
          originalFile: file, 
          status: 'pending',
          date: date,
          fromCache: false
        };

        let cachedAnalysis: AIAnalysisResult | null = null;
        if (useCache) {
           cachedAnalysis = await getCachedAnalysis(file);
        }

        if (cachedAnalysis) {
          const { base64, mimeType } = await processImageForAI(file);
          newRecords.push({
            ...tempRecord,
            base64,
            mimeType,
            analysis: cachedAnalysis,
            status: 'done',
            fromCache: true
          });
          cachedCount++;
        } else {
          const { base64, mimeType } = await processImageForAI(file);
          newRecords.push({
            ...tempRecord,
            base64,
            mimeType,
            status: 'pending',
            fromCache: false
          });
        }
      }

      if (cachedCount > 0) {
        addLog(txt.cacheHit(cachedCount), 'success');
      }

      // Initial Sort (Logical - using cached sceneIds if available)
      const initialSorted = sortPhotosLogical(newRecords);
      setPhotos(initialSorted);
      setStats({ total: initialSorted.length, processed: cachedCount, success: cachedCount, failed: 0, cached: cachedCount });
      setShowPreview(true);

      // 2. Identify Batch for API
      const pendingPhotos = initialSorted.filter(p => p.status === 'pending');
      
      if (pendingPhotos.length > 0) {
        addLog(`Starting analysis for ${pendingPhotos.length} new photos.`, 'info');
        
        const batchSize = DEFAULT_BATCH_SIZE; 
        for (let i = 0; i < pendingPhotos.length; i += batchSize) {
          const batch = pendingPhotos.slice(i, i + batchSize);
          setCurrentStep(`${txt.analyzing} (${i + 1}/${pendingPhotos.length})`);
          
          try {
             const results = await analyzePhotoBatch(batch, instruction, batchSize, appMode, apiKey, addLog);
             
             const updatedBatch = batch.map(record => {
               const res = results.find(r => r.fileName === record.fileName);
               if (res) {
                 cacheAnalysis(record, res).catch(console.error);
                 return { ...record, analysis: res, status: 'done' as const };
               }
               return { ...record, status: 'error' as const };
             });

             setPhotos(prev => prev.map(p => {
               const updated = updatedBatch.find(u => u.fileName === p.fileName);
               return updated || p;
             }));
             
             // Update Stats
             const success = photos.filter(p => p.status === 'done').length + updatedBatch.filter(p => p.status === 'done').length; // approx
             setStats(prev => ({ ...prev, processed: prev.processed + batch.length }));

          } catch (e: any) {
             console.error("Batch failed", e);
             addLog(`Batch analysis failed: ${e.message}`, 'error');
             setPhotos(prev => prev.map(p => {
               if (batch.find(b => b.fileName === p.fileName)) {
                 return { ...p, status: 'error' as const };
               }
               return p;
             }));
          }
        }
      }

      // 3. Normalize Consistency (Only for NEW records)
      const newlyAnalyzed = photos.filter(p => !p.fromCache && p.status === 'done');
      if (newlyAnalyzed.length > 0) {
        setCurrentStep("Finalizing data consistency...");
        const normalizedNew = await normalizeDataConsistency(newlyAnalyzed, apiKey, addLog);
        
        setPhotos(prev => prev.map(p => {
          const norm = normalizedNew.find(n => n.fileName === p.fileName);
          if (norm && norm.analysis) {
             cacheAnalysis(norm, norm.analysis).catch(console.error);
             return norm;
          }
          return p;
        }));
      }

      // 4. Final Sort (Logical)
      // This will use cached sceneIds from previous sessions if they exist!
      setPhotos(prev => sortPhotosLogical(prev));
      
      if (appMode === 'construction') {
         setInitialLayout(2);
      } else {
         setInitialLayout(3);
      }

      setSuccessMsg(txt.done);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Unknown error occurred");
      addLog("Pipeline fatal error", 'error', err);
    } finally {
      setIsProcessing(false);
      setCurrentStep("");
    }
  };

  const handleRefineAnalysis = async (instruction: string, batchSize: number) => {
    setShowRefineModal(false);
    setIsProcessing(true);
    setCurrentStep("Refining analysis...");
    clearLogs();

    try {
      let targetFileNames: string[] = [];

      if (instruction === "__REANALYZE__") {
        targetFileNames = photos.map(p => p.fileName);
        addLog("Re-analyzing ALL photos.", 'info');
      } else {
        setCurrentStep(txt.identifyingTargets);
        targetFileNames = await identifyTargetPhotos(photos, instruction, apiKey);
      }

      if (targetFileNames.length === 0) {
        setSuccessMsg("No matching photos found to update.");
        setIsProcessing(false);
        return;
      }

      const targets = photos.filter(p => targetFileNames.includes(p.fileName));
      let updatedTargets: PhotoRecord[] = [];
      
      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        setCurrentStep(`${txt.analyzing} (${i + 1}/${targets.length})`);
        
        try {
           const results = await analyzePhotoBatch(batch, instruction === "__REANALYZE__" ? "" : instruction, batchSize, appMode, apiKey, addLog);
           
           const processedBatch = batch.map(record => {
             const res = results.find(r => r.fileName === record.fileName);
             if (res) {
               let finalAnalysis = res;
               
               // Preserve Edited Fields
               if (record.analysis?.editedFields) {
                  finalAnalysis = { ...res, editedFields: record.analysis.editedFields };
                  record.analysis.editedFields.forEach(field => {
                     // @ts-ignore
                     finalAnalysis[field] = record.analysis![field]; 
                  });
               }
               // Preserve SceneID if it exists (so we don't break pairing)
               if (record.analysis?.sceneId) {
                  finalAnalysis.sceneId = record.analysis.sceneId;
                  finalAnalysis.phase = record.analysis.phase;
                  finalAnalysis.visualAnchors = record.analysis.visualAnchors; // Preserve anchors
               }

               cacheAnalysis(record, finalAnalysis).catch(console.error);
               return { ...record, analysis: finalAnalysis, status: 'done' as const };
             }
             return record;
           });
           updatedTargets = [...updatedTargets, ...processedBatch];

        } catch (e: any) {
           addLog(`Refine batch failed: ${e.message}`, 'error');
           updatedTargets = [...updatedTargets, ...batch];
        }
      }

      const otherPhotos = photos.filter(p => !targetFileNames.includes(p.fileName));
      const merged = [...otherPhotos, ...updatedTargets];
      const sorted = sortPhotosLogical(merged);
      
      setPhotos(sorted);
      setSuccessMsg(`Updated ${updatedTargets.length} photos.`);

    } catch (e: any) {
      console.error(e);
      setErrorMsg("Refine failed: " + e.message);
    } finally {
      setIsProcessing(false);
      setCurrentStep("");
    }
  };

  // --- Render ---

  if (!showPreview) {
    return (
      <UploadView 
        lang={lang}
        isProcessing={isProcessing}
        photos={photos}
        appMode={appMode}
        apiKey={apiKey}
        setApiKey={setApiKey}
        setAppMode={setAppMode}
        onStartProcessing={handleStartProcessing}
        onResume={handleResume}
        onCloseProject={handleCloseProject}
        onExportJson={() => {
          const json = exportDataToJson(photos);
          const blob = new Blob([json], { type: 'application/json' });
          saveAs(blob, `photo_archive_backup_${new Date().toISOString().slice(0, 10)}.json`);
        }}
        onImportJson={(e) => {
          if (!e.target.files || e.target.files.length === 0) return;
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = async (ev) => {
            try {
              const imported = importDataFromJson(ev.target?.result as string);
              setPhotos(imported);
              const success = imported.filter(p => p.status === 'done').length;
              setStats({ total: imported.length, processed: success, success, failed: 0, cached: 0 });
              saveProjectData(imported);
              setShowPreview(true);
            } catch (err) {
              alert("Invalid JSON file");
            }
          };
          reader.readAsText(file);
        }}
        onClearCache={handleClearCache}
      />
    );
  }

  return (
    <>
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
        initialLayout={initialLayout}
        onClearLogs={clearLogs}
        onGoHome={() => setShowPreview(false)}
        onCloseProject={handleCloseProject}
        onRefine={() => setShowRefineModal(true)}
        onExportExcel={generateExcel}
        onUpdatePhoto={handleUpdatePhoto}
        onDeletePhoto={handleDeletePhoto}
        onAutoPair={handleAutoPair}
        onSortByDate={handleSmartSort}
      />

      {pendingFiles && (
        <LimitModal 
          totalFiles={pendingFiles.length}
          maxPhotos={MAX_PHOTOS}
          selectionStart={selectionStart}
          selectionCount={selectionCount}
          lang={lang}
          onStartChange={setSelectionStart}
          onCountChange={(val) => setSelectionCount(Math.min(val, MAX_PHOTOS))}
          onCancel={() => setPendingFiles(null)}
          onConfirm={confirmLimitSelection}
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
