
import React, { useState, useEffect } from 'react';
import { PhotoRecord, ProcessingStats, AIAnalysisResult, AppMode, LogEntry } from './types';
import { processImageForAI, getPhotoDate } from './utils/imageUtils';
import { analyzePhotoBatch, identifyTargetPhotos, normalizeDataConsistency, assignSceneIds, refinePairContext } from './services/geminiService';
import { processPhotosWithSmartFlow } from './services/smartFlowService';
import { generateExcel } from './utils/excelGenerator';
import { saveProjectData, loadProjectData, clearProjectData, getCachedAnalysis, cacheAnalysis, exportDataToJson, importDataFromJson, clearAnalysisCache } from './utils/storage';
import { fsCache } from './utils/fileSystemCache';
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

  // Active instruction management - tracks the currently effective instruction
  // Priority: refinementInstruction > initialInstruction
  const [initialInstruction, setInitialInstruction] = useState<string>("");
  const [activeInstruction, setActiveInstruction] = useState<string>("");

  // Language
  const [lang, setLang] = useState<'en' | 'ja'>('en');
  const txt = TRANS[lang];

  // File System Cache
  const [fsCacheEnabled, setFsCacheEnabled] = useState(false);
  const [fsCacheStats, setFsCacheStats] = useState<{ totalFiles: number; lastUpdated: string } | null>(null);

  // Analysis Abort Control
  const [shouldAbortAnalysis, setShouldAbortAnalysis] = useState(false);

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
        // File System Cache 縺ｮ蠕ｩ蜈・ｒ隧ｦ縺ｿ繧・        if (fsCache.isAvailable()) {
          const restored = await fsCache.restoreHandle();
          if (restored) {
            setFsCacheEnabled(true);
            const stats = fsCache.getStats();
            setFsCacheStats(stats);
            addLog("File system cache restored from previous session.", 'success');
          }
        }

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

  // ESC Key Listener for Analysis Interruption
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isProcessing) {
        setShouldAbortAnalysis(true);
        addLog("ESC pressed - aborting analysis...", 'info');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing]);

  // --- Helpers ---

  const addLog = (message: string, type: LogEntry['type'] = 'info', details?: any) => {
    const timestamp = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    setLogs(prev => [...prev, { timestamp, message, type, details }]);
  };

  const logIndividualResult = (fileName: string, result: AIAnalysisResult) => {
    const summary = [
      `萄 ${fileName}`,
      result.workType && `蟾･遞ｮ: ${result.workType}`,
      result.variety && `遞ｮ蛻･: ${result.variety}`,
      result.detail && `邏ｰ蛻･: ${result.detail}`,
      result.station && `貂ｬ轤ｹ: ${result.station}`,
      result.remarks && `蛯呵・ ${result.remarks}`,
    ].filter(Boolean).join(' | ');

    addLog(summary, 'success', result);
  };

  const clearLogs = () => setLogs([]);

  // 繝励Ο繝ｳ繝励ヨ縺九ｉ貂ｬ轤ｹ蜷阪ｒ謚ｽ蜃ｺ縺吶ｋ蜈ｱ騾夐未謨ｰ
  const extractLocationName = (prompt: string): string => {
    // 繝代ち繝ｼ繝ｳ1: 縲梧ｸｬ轤ｹ縺ｯ縲・・→縺吶ｋ縲阪梧ｸｬ轤ｹ繧偵・・↓邨ｱ荳縲阪↑縺ｩ
    const sokuten1 = prompt.match(/貂ｬ轤ｹ[縺ｯ繧綻荳蠕九↓?([^縺ｨ縺ｫ縲√・n]+?)(?:[縺ｨ縺ｫ](?:邨ｱ荳|縺吶ｋ)|$)/);
    if (sokuten1) {
      return sokuten1[1].trim();
    }

    // 繝代ち繝ｼ繝ｳ2: 縲梧ｸｬ轤ｹ・壹・・阪梧ｸｬ轤ｹ:縲・・・    const sokuten2 = prompt.match(/貂ｬ轤ｹ[・・]\s*([^縲√・n]+)/);
    if (sokuten2) {
      return sokuten2[1].trim();
    }

    // 繝代ち繝ｼ繝ｳ3: 縲後・・ｻ倩ｿ代阪後・・慍轤ｹ縲阪↑縺ｩ繧貞性繧陦後ｒ謗｢縺・    const locationPattern = prompt.match(/([^縲√・n]*(?:莉倩ｿ掃蝨ｰ轤ｹ|蝨ｰ蛹ｺ|荳∫岼)[^縲√・n]*)/);
    if (locationPattern) {
      // 荳崎ｦ√↑蜑榊ｾ後ｒ蜑企勁
      const location = locationPattern[1]
        .replace(/^.*(?:貂ｬ轤ｹ[縺ｯ繧綻|蝣ｴ謇[縺ｯ繧綻|菴咲ｽｮ[縺ｯ繧綻|荳蠕九↓)/, '')
        .replace(/(?:[縺ｨ縺ｫ](?:邨ｱ荳|縺吶ｋ)|縺ｧ縺處縺ｧ縺ゅｋ).*$/, '')
        .trim();
      if (location) return location;
    }

    // 繝代ち繝ｼ繝ｳ4: 譛蛻昴・陦後ｒ蜿門ｾ暦ｼ医ヵ繧ｩ繝ｼ繝ｫ繝舌ャ繧ｯ・・    const lines = prompt.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // 縲後・・ｷ･莠九阪↑縺ｩ繧帝勁蜴ｻ
      const cleanedLine = firstLine.replace(/蟾･莠・*$/, '').trim();
      if (cleanedLine) {
        return cleanedLine.substring(0, 30);
      }
    }

    return '迴ｾ蝣ｴ';
  };

  // --- Logic Controllers ---

  // File System Cache 髢｢騾｣
  const handleSelectCacheFolder = async () => {
    if (!fsCache.isAvailable()) {
      setErrorMsg("File System Access API is not supported in this browser.");
      return;
    }

    try {
      const selected = await fsCache.selectDirectory();
      if (selected) {
        setFsCacheEnabled(true);
        await fsCache.saveHandle(); // 繝上Φ繝峨Ν繧剃ｿ晏ｭ・        const stats = fsCache.getStats();
        setFsCacheStats(stats);
        setSuccessMsg("Cache folder selected successfully!");
        addLog("File system cache enabled", 'success');
      }
    } catch (error) {
      console.error("Failed to select cache folder:", error);
      setErrorMsg("Failed to select cache folder. Please try again.");
    }
  };

  const handleClearFileSystemCache = async () => {
    if (!fsCacheEnabled) return;

    const confirmMsg = "Clear all file system cache?\n(This will remove all cached analysis results from the selected folder)";
    if (window.confirm(confirmMsg)) {
      await fsCache.clearCache();
      const stats = fsCache.getStats();
      setFsCacheStats(stats);
      setSuccessMsg("File system cache cleared!");
      addLog("File system cache cleared", 'info');
    }
  };

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
      ? "隗｣譫先ｸ医∩縺ｮ繧ｭ繝｣繝・す繝･繝・・繧ｿ繧貞炎髯､縺励∪縺吶°・歃n・育樟蝨ｨ陦ｨ遉ｺ荳ｭ縺ｮ繝・・繧ｿ縺ｯ豸医∴縺ｾ縺帙ｓ縺後∵ｬ｡蝗樔ｻ･髯阪・隗｣譫舌〒API縺御ｽｿ逕ｨ縺輔ｌ縺ｾ縺呻ｼ・
      : "Clear analysis cache?\n(Current view is not affected, but next analysis will use API)";

    if (window.confirm(msg)) {
      await clearAnalysisCache();
      setStats(prev => ({ ...prev, cached: 0 }));
      setPhotos(prev => prev.map(p => ({ ...p, fromCache: false })));
      alert(lang === 'ja' ? "繧ｭ繝｣繝・す繝･繧貞炎髯､縺励∪縺励◆縲・ : "Cache cleared.");
      addLog("Cache cleared by user.", 'info');
    }
  };

  const handleDeletePhoto = (fileName: string) => {
    if (window.confirm(lang === 'ja' ? "縺薙・蜀咏悄繧貞炎髯､縺励※繧ゅｈ繧阪＠縺・〒縺吶°・・ : "Are you sure you want to delete this photo?")) {
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
    s = s.replace(/[・・・枉/g, r => String.fromCharCode(r.charCodeAt(0) - 0xFEE0));
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
    if (text.includes("逹謇句燕") || text.includes("before") || text.includes("pre")) return 0;
    if (text.includes("螳御ｺ・) || text.includes("遶｣蟾･") || text.includes("after") || text.includes("done")) return 2;
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
   * Proper Before-After Pairing for Construction Photos
   * Strategy:
   * 1. Group by SceneID/Station (location-based)
   * 2. Within each group, identify before and after photos
   * 3. Create actual pairs (before, after) for layout
   * 4. Arrange pairs in sequence for proper page layout
   */
  const arrangePairsStrictly = (records: PhotoRecord[]): { sorted: PhotoRecord[], pairCount: number, omittedCount: number } => {
    const groups: { [key: string]: PhotoRecord[] } = {};
    let omittedCount = 0;

    // 1. Grouping by scene or station
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
        // Photos without grouping are tracked but may be omitted from pairs
        omittedCount++;
      }
    });

    const pairs: PhotoRecord[][] = [];
    const groupKeys = Object.keys(groups);

    // Sort group keys for consistent ordering
    groupKeys.sort();

    groupKeys.forEach(key => {
      const group = groups[key];

      // Need at least 2 photos for a pair
      if (group.length < 2) {
        omittedCount += group.length;
        return;
      }

      // Sort by date within each group
      group.sort((a, b) => {
        if (a.date && b.date) return a.date - b.date;
        return (a.fileName || "").localeCompare(b.fileName || "");
      });

      // Identify before and after photos based on phase or position
      let beforePhoto: PhotoRecord | null = null;
      let afterPhoto: PhotoRecord | null = null;

      // First, try to find explicitly marked photos
      group.forEach(photo => {
        const remarks = photo.analysis?.remarks || "";
        const phase = photo.analysis?.phase;

        if (!beforePhoto && (phase === 'before' || remarks.includes("逹謇句燕") || remarks.includes("譁ｽ蟾･蜑・))) {
          beforePhoto = photo;
          if (photo.analysis) photo.analysis.phase = 'before';
        } else if (!afterPhoto && (phase === 'after' || remarks.includes("螳御ｺ・) || remarks.includes("螳梧・") || remarks.includes("遶｣蟾･"))) {
          afterPhoto = photo;
          if (photo.analysis) photo.analysis.phase = 'after';
        }
      });

      // If not found explicitly, use first and last
      if (!beforePhoto) {
        beforePhoto = group[0];
        if (beforePhoto.analysis) beforePhoto.analysis.phase = 'before';
      }
      if (!afterPhoto && group.length > 1) {
        afterPhoto = group[group.length - 1];
        if (afterPhoto.analysis) afterPhoto.analysis.phase = 'after';
      }

      // Create the pair if both photos exist
      if (beforePhoto && afterPhoto && beforePhoto !== afterPhoto) {
        pairs.push([beforePhoto, afterPhoto]);

        // Count omitted middle photos
        const usedPhotos = new Set([beforePhoto.fileName, afterPhoto.fileName]);
        group.forEach(photo => {
          if (!usedPhotos.has(photo.fileName)) {
            omittedCount++;
          }
        });
      } else {
        // Can't form a proper pair
        omittedCount += group.length;
      }
    });

    // Sort pairs by the date of the after photo (construction completion order)
    pairs.sort((a, b) => {
      const dateA = a[1].date || 0;
      const dateB = b[1].date || 0;
      return dateA - dateB;
    });

    // Flatten pairs into alternating before-after sequence
    const sorted: PhotoRecord[] = [];
    pairs.forEach(pair => {
      sorted.push(pair[0]); // before
      sorted.push(pair[1]); // after
    });

    return { sorted, pairCount: pairs.length, omittedCount };
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
            phase: ((r.analysis?.remarks || "").includes("逹謇句燕") ? 'before' : (r.analysis?.remarks || "").includes("螳御ｺ・) ? 'after' : 'status') as any
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

      // 5. Create before-after pairs
      const { sorted, pairCount, omittedCount } = arrangePairsStrictly(allUpdated);

      setPhotos(sorted);
      setSuccessMsg(lang === 'ja'
        ? `${pairCount}邨・・逹謇句燕-遶｣蟾･繝壹い繧剃ｽ懈・縺励∪縺励◆${omittedCount > 0 ? `・・{omittedCount}譫壹・髯､螟厄ｼ荏 : ''}`
        : `Created ${pairCount} before-after pairs${omittedCount > 0 ? ` (${omittedCount} photos omitted)` : ''}`);

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
    setSuccessMsg(lang === 'ja' ? "貂ｬ轤ｹ繝ｻ繧ｷ繝ｼ繝ｳ諠・ｱ縺ｫ蝓ｺ縺･縺・※荳ｦ縺ｳ譖ｿ縺医∪縺励◆" : "Sorted by Scene & Phase");
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
    setShouldAbortAnalysis(false); // Reset abort flag
    setErrorMsg(null);
    setSuccessMsg(null);
    clearLogs();

    // Store initial instruction as active
    setInitialInstruction(instruction);
    setActiveInstruction(instruction);
    addLog(`[INSTRUCTION] Initial: "${instruction.substring(0, 50)}${instruction.length > 50 ? '...' : ''}"`, 'info');

    try {
      // 1. Prepare Records & Check Cache
      setCurrentStep(lang === 'ja' ? "逕ｻ蜒上ｒ貅門ｙ荳ｭ..." : "Preparing images...");

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
          // 繧ｭ繝｣繝・す繝･縺輔ｌ縺溷・譫千ｵ先棡縺ｫ貂ｬ轤ｹ蜷阪ｒ霑ｽ蜉
          const locationName = extractLocationName(instruction);
          newRecords.push({
            ...tempRecord,
            base64,
            mimeType,
            analysis: {
              ...cachedAnalysis,
              station: locationName  // 繝励Ο繝ｳ繝励ヨ縺九ｉ謚ｽ蜃ｺ縺励◆貂ｬ轤ｹ蜷阪ｒ霑ｽ蜉
            },
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

      // 2. Smart Flow: 蜀咏悄繧ｿ繧､繝励ｒ閾ｪ蜍募愛螳壹＠縺ｦ譛驕ｩ縺ｪ蜃ｦ逅・ｒ驕ｸ謚・      const pendingPhotos = initialSorted.filter(p => p.status === 'pending');

      if (pendingPhotos.length > 0) {
        addLog(`${pendingPhotos.length}譫壹・譁ｰ縺励＞蜀咏悄繧貞・逅・＠縺ｾ縺兪, 'info');

        // 繧ｹ繝槭・繝医ヵ繝ｭ繝ｼ縺ｧ蜃ｦ逅・        const result = await processPhotosWithSmartFlow(
          pendingPhotos,
          apiKey,
          instruction,
          addLog
        );

        if (result.type === 'paired') {
          // 譎ｯ隕ｳ蜀咏悄繝｢繝ｼ繝会ｼ壹・繧｢繝ｪ繝ｳ繧ｰ螳御ｺ・          addLog('譎ｯ隕ｳ蜀咏悄繝｢繝ｼ繝峨〒蜃ｦ逅・＠縺ｾ縺励◆', 'success');

          // 繝励Ο繝ｳ繝励ヨ縺九ｉ貂ｬ轤ｹ蜷阪ｒ謚ｽ蜃ｺ・亥・騾夐未謨ｰ繧剃ｽｿ逕ｨ・・          const locationName = extractLocationName(instruction);

          // 繝壹い繧貞ｱ暮幕縺励※蜀咏悄繝ｪ繧ｹ繝医ｒ譖ｴ譁ｰ
          const updatedPhotos: PhotoRecord[] = [];
          result.pairs?.forEach(pair => {
            // analysis 縺悟ｭ伜惠縺励↑縺・ｴ蜷医・遨ｺ縺ｮ繧ｪ繝悶ず繧ｧ繧ｯ繝医ｒ蛻晄悄蛹・            const beforeAnalysis = pair.before.analysis || {
              fileName: pair.before.fileName,
              workType: '',
              variety: '',
              detail: '',
              station: '',
              remarks: '',
              description: '',
              hasBoard: false,
              detectedText: ''
            };

            const afterAnalysis = pair.after.analysis || {
              fileName: pair.after.fileName,
              workType: '',
              variety: '',
              detail: '',
              station: '',
              remarks: '',
              description: '',
              hasBoard: false,
              detectedText: ''
            };

            // before縺ｨafter縺ｫsceneId縺ｨphase繧剃ｻ倅ｸ弱∵ｸｬ轤ｹ蜷阪→蛯呵・ｒ霑ｽ蜉
            const beforePhoto = {
              ...pair.before,
              analysis: {
                ...beforeAnalysis,
                sceneId: pair.sceneId,
                phase: 'before' as const,
                station: locationName, // 貂ｬ轤ｹ蜷阪ｒ霑ｽ蜉
                remarks: '逹謇句燕' // 蛯呵・↓逹謇句燕繧定ｨ倩ｼ・              },
              status: 'done' as const
            };
            const afterPhoto = {
              ...pair.after,
              analysis: {
                ...afterAnalysis,
                sceneId: pair.sceneId,
                phase: 'after' as const,
                station: locationName, // 貂ｬ轤ｹ蜷阪ｒ霑ｽ蜉
                remarks: '遶｣蟾･' // 蛯呵・↓遶｣蟾･繧定ｨ倩ｼ・              },
              status: 'done' as const
            };
            updatedPhotos.push(beforePhoto, afterPhoto);
          });

          setPhotos(prev => {
            const unchanged = prev.filter(p => p.status !== 'pending');
            return [...unchanged, ...updatedPhotos];
          });

          setInitialLayout(2); // 2-up繝ｬ繧､繧｢繧ｦ繝医↓閾ｪ蜍募・繧頑崛縺・
        } else {
          // 鮟呈攸縺ゅｊ繝｢繝ｼ繝会ｼ壼ｾ捺擂縺ｮ隧ｳ邏ｰ隗｣譫・          const batchSize = DEFAULT_BATCH_SIZE;
          for (let i = 0; i < pendingPhotos.length; i += batchSize) {
            const batch = pendingPhotos.slice(i, i + batchSize);
            setCurrentStep(`${txt.analyzing} (${i + 1}/${pendingPhotos.length})`);

            try {
              const results = await analyzePhotoBatch(
                batch,
                instruction,
                batchSize,
                appMode,
                apiKey,
                addLog,
                logIndividualResult,
                () => shouldAbortAnalysis
              );

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

// Console CLI instruction handler
  const handleConsoleInstruction = (instruction: string) => {
    addLog("User instruction: " + instruction, "info");
    handleRefineAnalysis(instruction, 6);
  };
  const handleRefineAnalysis = async (instruction: string, batchSize: number) => {
    setShowRefineModal(false);
    setIsProcessing(true);
    setCurrentStep("Refining analysis...");
    clearLogs();

    // Update active instruction (refinement takes priority)
    if (instruction && instruction !== "__REANALYZE__") {
      setActiveInstruction(instruction);
      addLog(`[INSTRUCTION] Refinement: "${instruction.substring(0, 50)}${instruction.length > 50 ? '...' : ''}"`, 'info');
      addLog(`[INSTRUCTION] Priority: Refinement > Initial`, 'info');
    }

    try {
      let targetFileNames: string[] = [];

      // Check if refinement instruction contains a station specification
      const refinementStation = extractLocationName(instruction);
      const hasStationOverride = instruction && instruction !== "__REANALYZE__" && 
        (instruction.includes('貂ｬ轤ｹ') || instruction.includes('莉倩ｿ・) || instruction.includes('蝨ｰ轤ｹ'));

      if (hasStationOverride) {
        addLog(`[INSTRUCTION] Station override detected: "${refinementStation}"`, 'info');
      }

      if (instruction === "__REANALYZE__") {
        targetFileNames = photos.map(p => p.fileName);
        addLog("Re-analyzing ALL photos.", 'info');
      } else {
        setCurrentStep(txt.identifyingTargets);
        targetFileNames = await identifyTargetPhotos(photos, instruction, apiKey, addLog);
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
          const results = await analyzePhotoBatch(
            batch,
            instruction === "__REANALYZE__" ? "" : instruction,
            batchSize,
            appMode,
            apiKey,
            addLog,
            logIndividualResult,
            () => shouldAbortAnalysis
          );

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

      // If refinement had station override, apply to ALL photos (including non-targets)
      let otherPhotos = photos.filter(p => !targetFileNames.includes(p.fileName));
      
      if (hasStationOverride && refinementStation) {
        addLog(`[INSTRUCTION] Applying station "${refinementStation}" to all ${otherPhotos.length + updatedTargets.length} photos`, 'info');
        
        // Update other photos with new station
        otherPhotos = otherPhotos.map(p => {
          if (p.analysis) {
            return {
              ...p,
              analysis: {
                ...p.analysis,
                station: refinementStation
              }
            };
          }
          return p;
        });

        // Also ensure updated targets have the station
        updatedTargets = updatedTargets.map(p => {
          if (p.analysis) {
            return {
              ...p,
              analysis: {
                ...p.analysis,
                station: refinementStation
              }
            };
          }
          return p;
        });
      }

      const merged = [...otherPhotos, ...updatedTargets];
      const sorted = sortPhotosLogical(merged);

      setPhotos(sorted);
      setSuccessMsg(`Updated ${updatedTargets.length} photos.${hasStationOverride ? ` Station set to "${refinementStation}"` : ''}`);

    } catch (e: any) {
      console.error(e);
      setErrorMsg("Refine failed: " + e.message);
      setShouldAbortAnalysis(false); // Reset abort flag
    }
  };

  const handleSingleReanalysis = async (fileName: string) => {
    setIsProcessing(true);
    setCurrentStep(`Re-analyzing ${fileName}...`);
    clearLogs();
    setShouldAbortAnalysis(false);

    try {
      const target = photos.find(p => p.fileName === fileName);
      if (!target) return;

      const results = await analyzePhotoBatch(
        [target],
        "", // Empty instruction for default analysis
        1, // batchSize
        appMode,
        apiKey,
        addLog,
        logIndividualResult,
        () => shouldAbortAnalysis,
        (reasoningText) => {
          setCurrentStep(`Thinking: ${reasoningText.slice(0, 100)}${reasoningText.length > 100 ? '...' : ''}`);
        }
      );

      if (results.length > 0) {
        const res = results[0];
        let finalAnalysis = res;

        // Preserve Edited Fields
        if (target.analysis?.editedFields) {
          finalAnalysis = { ...res, editedFields: target.analysis.editedFields };
          target.analysis.editedFields.forEach(field => {
            // @ts-ignore
            finalAnalysis[field] = target.analysis[field];
          });
        }

        setPhotos(prev => prev.map(p =>
          p.fileName === fileName
            ? { ...p, analysis: finalAnalysis, status: 'done' }
            : p
        ));

        if (res.reasoning) {
          addLog(`Reasoning for ${fileName}: ${res.reasoning}`, 'info');
          console.log(`[AI Reasoning] ${fileName}:`, res.reasoning);
        }

        addLog(`Re-analysis complete for ${fileName}`, 'success');
        setSuccessMsg("Photo re-analyzed successfully.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Re-analysis failed");
      addLog("Re-analysis error", 'error', err);
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
        onShowPreview={() => setShowPreview(true)}
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
        fsCacheEnabled={fsCacheEnabled}
        fsCacheStats={fsCacheStats}
        onClearLogs={clearLogs}
        onGoHome={() => { setShouldAbortAnalysis(true); setShowPreview(false); }}
        onCloseProject={handleCloseProject}
        onRefine={() => setShowRefineModal(true)}
        onExportExcel={generateExcel}
        onUpdatePhoto={handleUpdatePhoto}
        onDeletePhoto={handleDeletePhoto}
        onAutoPair={handleAutoPair}
        onSortByDate={handleSmartSort}
        onSendInstruction={handleConsoleInstruction}
        onSelectCacheFolder={handleSelectCacheFolder}
        onClearFileSystemCache={handleClearFileSystemCache}
        onReanalyzePhoto={handleSingleReanalysis}
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
