import React, { useState, useEffect, useRef } from 'react';
import { PhotoRecord, ProcessingStats, AIAnalysisResult, AppMode, LogEntry, SortPolicy } from './types';
import { processImageForAI, getPhotoDate } from './utils/imageUtils';
import { analyzePhotoBatch, identifyTargetPhotos, getNormalizationProposals, applyNormalizationCorrections, assignSceneIds, refinePairContext, getApiKey, setApiKey as saveApiKey, hasApiKey, NormalizationCorrection, getSelectedModel } from './services/geminiService';
import { processPhotosWithSmartFlow } from './services/smartFlowService';
import { generateExcel } from './utils/excelGenerator';
import { saveProjectData, loadProjectData, clearProjectData, getCachedAnalysis, cacheAnalysis, exportDataToJson, importDataFromJson, clearAnalysisCache, saveAnalysisHistory, getAnalysisHistory, getAnalysisHistoryEntry, deleteAnalysisHistory } from './utils/storage';
import { extractSessionFromPdf, isSmartPdf, extractImagesFromPdf, extractTextWithPositions, parsePositionedTextToRecords } from './utils/pdfGenerator';
import { fsCache } from './utils/fileSystemCache';
import { TRANS } from './utils/translations';
import { getDetailOrderMap, getVarietyOrderMap } from './utils/constructionMaster';
import { learnFromOrder, getLearnedOrderValue } from './utils/learnedSortOrder';
import { applyAliasesToRecords, loadAliasSettings, hasAliases } from './utils/workTypeAliases';
import { recordManualEdit, initLearningService } from './services/learningService';

// Components
import UploadView from './components/UploadView';
import PreviewView from './components/PreviewView';
import LimitModal from './components/LimitModal';
import RefineModal from './components/RefineModal';
import ApiKeySetup from './components/ApiKeySetup';
import ModelValidation from './components/ModelValidation';
import UsagePanel from './components/UsagePanel';
import ManualPairingModal from './components/ManualPairingModal';
import MasterEditorModal from './components/MasterEditorModal';
import StationReplaceModal from './components/StationReplaceModal';
import WorkTypeConfirmModal from './components/WorkTypeConfirmModal';
import NormalizationPreviewModal, { OriginalData } from './components/NormalizationPreviewModal';
import SessionHistoryPanel from './components/SessionHistoryPanel';
import GitHubSyncPanel from './components/GitHubSyncPanel';
import { AnalysisHistoryEntry } from './types';

// Declare saveAs for export
declare const saveAs: any;

const DEFAULT_BATCH_SIZE = 6;
const PARALLEL_BATCHES = 2; // 同時実行バッチ数
const MAX_PHOTOS = 30;

type PendingFile = { file: File, date: number };

export default function App() {
  // API Key from localStorage (user input)
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [showApiKeySetup, setShowApiKeySetup] = useState(false);
  const [showModelValidation, setShowModelValidation] = useState(false);
  const [pendingApiKey, setPendingApiKey] = useState<string | null>(null);

  // Initialize API key from localStorage on mount
  useEffect(() => {
    const storedKey = getApiKey();
    if (storedKey) {
      setApiKeyState(storedKey);
    }
    // APIキーがなくてもUploadViewを表示（PDF読み込み等は可能）
  }, []);

  // ApiKeySetup → ModelValidation への遷移
  const handleApiKeyInput = (key: string) => {
    setPendingApiKey(key);
    setShowApiKeySetup(false);
    setShowModelValidation(true);
  };

  // ModelValidation 完了時
  const handleModelValidationComplete = (key: string) => {
    saveApiKey(key);
    setApiKeyState(key);
    setPendingApiKey(null);
    setShowModelValidation(false);
  };

  // ModelValidation から戻る
  const handleModelValidationBack = () => {
    setShowModelValidation(false);
    setShowApiKeySetup(true);
  };

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
  const [currentSortPolicy, setCurrentSortPolicy] = useState<SortPolicy>('by_detail_safety_first');

  // Console Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Modals
  const [pendingFiles, setPendingFiles] = useState<PendingFile[] | null>(null);
  const [selectionStart, setSelectionStart] = useState(1);
  const [selectionCount, setSelectionCount] = useState(MAX_PHOTOS);
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [showManualPairing, setShowManualPairing] = useState(false);
  const [manualPairingPhotos, setManualPairingPhotos] = useState<PhotoRecord[]>([]);
  const [showMasterEditor, setShowMasterEditor] = useState(false);
  const [showStationReplace, setShowStationReplace] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showGitHubSync, setShowGitHubSync] = useState(false);
  const [showWorkTypeConfirm, setShowWorkTypeConfirm] = useState(false);
  const [pendingAnalysisFiles, setPendingAnalysisFiles] = useState<File[] | null>(null);

  // Normalization approval flow
  const [showNormalizationModal, setShowNormalizationModal] = useState(false);
  const [normalizationProposals, setNormalizationProposals] = useState<NormalizationCorrection[]>([]);
  const [normalizationOriginals, setNormalizationOriginals] = useState<OriginalData[]>([]);
  const [photosForNormalization, setPhotosForNormalization] = useState<PhotoRecord[]>([]);
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

  // Analysis Abort Control (useRef to avoid stale closure issues)
  const shouldAbortRef = useRef(false);

  // Detect Language
  useEffect(() => {
    if (navigator.language.startsWith('ja')) setLang('ja');
  }, []);

  // Load data
  useEffect(() => {
    const initLoad = async () => {
      try {
        // 学習サービスを初期化
        await initLearningService();

        // File System Cache の復元を試みる
        if (fsCache.isAvailable()) {
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
        shouldAbortRef.current = true;
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
      `📸 ${fileName}`,
      result.workType && `工種: ${result.workType}`,
      result.variety && `種別: ${result.variety}`,
      result.detail && `細別: ${result.detail}`,
      result.station && `測点: ${result.station}`,
      result.remarks && `備考: ${result.remarks}`,
    ].filter(Boolean).join(' | ');

    addLog(summary, 'success', result);
  };

  const clearLogs = () => setLogs([]);

  // プロンプトから測点名を抽出する共通関数
  const extractLocationName = (prompt: string): string => {
    // パターン1: 「測点は〇〇とする」「測点を〇〇に統一」など
    const sokuten1 = prompt.match(/測点[はを統一等に]?([^とな、。\n]+?)(?:[とに](?:統一|する)|$)/);
    if (sokuten1) {
      return sokuten1[1].trim();
    }

    // パターン2: 「測点：〇〇」「測点:〇〇」
    const sokuten2 = prompt.match(/測点[：:]\s*([^、。\n]+)/);
    if (sokuten2) {
      return sokuten2[1].trim();
    }

    // パターン3: 「〇〇付近」「〇〇地点」などを含む行を探す
    const locationPattern = prompt.match(/([^、。\n]*(?:付近|地点|地区|丁目)[^、。\n]*)/);
    if (locationPattern) {
      // 不要な前後を削除
      const location = locationPattern[1]
        .replace(/^.*(?:測点[はを]|場所[はを]|位置[はを]|一律に)/, '')
        .replace(/(?:[とに](?:統一|する)|です|である).*$/, '')
        .trim();
      if (location) return location;
    }

    // パターン4: 最初の行を取得（フォールバック）
    const lines = prompt.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // 「〇〇工事」などを除去
      const cleanedLine = firstLine.replace(/工事.*$/, '').trim();
      if (cleanedLine) {
        return cleanedLine.substring(0, 30);
      }
    }

    return '現場';
  };

  // --- Logic Controllers ---

  // File System Cache 関連
  const handleSelectCacheFolder = async () => {
    if (!fsCache.isAvailable()) {
      setErrorMsg("File System Access API is not supported in this browser.");
      return;
    }

    try {
      const selected = await fsCache.selectDirectory();
      if (selected) {
        setFsCacheEnabled(true);
        await fsCache.saveHandle(); // ハンドルを保存
        const stats = fsCache.getStats();
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
      setInitialLayout(3); // レイアウトをデフォルトに戻す
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

  // 測点の一括置換
  const handleStationReplace = (replacements: Array<{ fileName: string; newStation: string }>) => {
    if (replacements.length === 0) return;

    setPhotos(prev => prev.map(p => {
      const replacement = replacements.find(r => r.fileName === p.fileName);
      if (replacement && p.analysis) {
        const updatedAnalysis = { ...p.analysis, station: replacement.newStation };
        cacheAnalysis(p, updatedAnalysis).catch(console.error);
        return { ...p, analysis: updatedAnalysis };
      }
      return p;
    }));
    setSuccessMsg(`${replacements.length}枚の測点を更新しました`);
    addLog(`測点を一括置換: ${replacements.length}枚`, 'success');
  };

  // --- Normalization Approval Handlers ---

  const handleNormalizationApprove = (approvedCorrections: NormalizationCorrection[]) => {
    if (approvedCorrections.length > 0) {
      // Apply corrections using the service function
      const corrected = applyNormalizationCorrections(photosForNormalization, approvedCorrections);

      // Update photos state and cache
      setPhotos(prev => prev.map(p => {
        const correctedPhoto = corrected.find(c => c.fileName === p.fileName);
        if (correctedPhoto && correctedPhoto.analysis) {
          cacheAnalysis(correctedPhoto, correctedPhoto.analysis).catch(console.error);
          return correctedPhoto;
        }
        return p;
      }));

      addLog(`${approvedCorrections.length}件の修正を適用しました`, 'success');
      setSuccessMsg(`${approvedCorrections.length}件の修正を適用しました`);
    } else {
      addLog('修正をスキップしました', 'info');
    }

    // Final sort and cleanup
    setPhotos(prev => sortPhotosLogical(prev));

    // エイリアス自動適用（設定が有効な場合）
    const aliasSettings = loadAliasSettings();
    if (aliasSettings.enabled && hasAliases(aliasSettings)) {
      setPhotos(prev => {
        const { modifiedCount, records } = applyAliasesToRecords(prev, aliasSettings);
        if (modifiedCount > 0) {
          addLog(`エイリアス自動適用: ${modifiedCount}件のデータを変換しました`, 'success');
        }
        return records;
      });
    }

    setShowNormalizationModal(false);
    setNormalizationProposals([]);
    setNormalizationOriginals([]);
    setPhotosForNormalization([]);
  };

  const handleNormalizationReject = () => {
    addLog('全ての修正提案を却下しました', 'info');
    setSuccessMsg('整合性チェックの修正を却下しました');

    // Final sort without applying corrections
    setPhotos(prev => sortPhotosLogical(prev));

    // エイリアス自動適用（設定が有効な場合）
    const aliasSettings = loadAliasSettings();
    if (aliasSettings.enabled && hasAliases(aliasSettings)) {
      setPhotos(prev => {
        const { modifiedCount, records } = applyAliasesToRecords(prev, aliasSettings);
        if (modifiedCount > 0) {
          addLog(`エイリアス自動適用: ${modifiedCount}件のデータを変換しました`, 'success');
        }
        return records;
      });
    }

    setShowNormalizationModal(false);
    setNormalizationProposals([]);
    setNormalizationOriginals([]);
    setPhotosForNormalization([]);
  };

  const handleNormalizationRetry = async (customPrompt: string) => {
    if (!apiKey) return;

    setShowNormalizationModal(false);
    setIsProcessing(true);
    setCurrentStep("カスタム指示で再解析中...");
    addLog(`カスタム指示で再解析: "${customPrompt.substring(0, 50)}..."`, 'info');

    try {
      const result = await getNormalizationProposals(
        photosForNormalization,
        apiKey,
        customPrompt,
        addLog,
        () => shouldAbortRef.current
      );

      if (result.corrections.length > 0) {
        setNormalizationProposals(result.corrections);
        addLog(`${result.corrections.length}件の新しい修正提案があります`, 'info');
        setShowNormalizationModal(true);
      } else {
        addLog('修正提案なし - データは整合しています', 'success');
        setPhotos(prev => sortPhotosLogical(prev));
        setSuccessMsg('データは整合しています');
        setPhotosForNormalization([]);
        setNormalizationOriginals([]);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "再解析に失敗しました");
      addLog("再解析エラー", 'error', err);
    } finally {
      setIsProcessing(false);
      setCurrentStep("");
    }
  };

  // 並べ替え後の順序を学習して保存
  const handleReorderPhotos = (reorderedPhotos: PhotoRecord[]) => {
    // 順序を学習（detail値の順序を記録）
    const orderedDetails = reorderedPhotos.map(p => p.analysis?.detail || p.analysis?.variety || '');
    learnFromOrder(orderedDetails);

    // 写真の順序を更新
    setPhotos(reorderedPhotos);
    addLog(`順序を学習しました: ${orderedDetails.filter(d => d).join(' → ')}`, 'info');
  };

  const handleUpdatePhoto = (fileName: string, field: keyof AIAnalysisResult, value: string) => {
    setPhotos(prev => prev.map(p => {
      if (p.fileName === fileName && p.analysis) {
        // 元の値を保存（学習用）
        const oldValue = String(p.analysis[field] || '');

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

        // 学習サービスに修正を記録（自動でGitHubにプッシュされる）
        if (oldValue !== value) {
          recordManualEdit(p.analysis, field, oldValue, value).catch(e =>
            console.warn("Failed to record edit for learning:", e)
          );
        }

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
    // Normalize full-width characters to half-width
    s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
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
    if (text.includes("着手前") || text.includes("before") || text.includes("pre") || text.includes("施工前")) return 0;
    if (text.includes("完了") || text.includes("竣工") || text.includes("after") || text.includes("done")) return 2;
    return 1;
  };

  /**
   * Sorts photos based on the current sort policy.
   */
  const sortPhotosLogical = (records: PhotoRecord[], policy: SortPolicy = currentSortPolicy): PhotoRecord[] => {
    const isSafetyPhoto = (r: PhotoRecord) => {
      const workType = r.analysis?.workType || '';
      const remarks = r.analysis?.remarks || '';
      const safetyKeywords = ['朝礼', 'KY', '安全', '新規入場', '点灯', '巡視', '保安'];
      // workTypeに安全が含まれる、または備考に安全関連キーワードが含まれる
      return workType.includes('安全管理') || workType.includes('安全') ||
             safetyKeywords.some(kw => remarks.includes(kw));
    };

    // 時系列ソート（基本）
    const chronologicalSort = (a: PhotoRecord, b: PhotoRecord) => {
      const dateA = a.date || 0;
      const dateB = b.date || 0;
      const TIME_WINDOW = 5 * 60 * 1000;
      const timeDiff = Math.abs(dateA - dateB);

      if (timeDiff <= TIME_WINDOW) {
        const stationA = normalizeStationName(a.analysis?.station) || "ZZZ";
        const stationB = normalizeStationName(b.analysis?.station) || "ZZZ";
        if (stationA !== stationB) return stationA.localeCompare(stationB);

        const scoreA = getPhaseScore(a);
        const scoreB = getPhaseScore(b);
        if (scoreA !== scoreB) return scoreA - scoreB;
      }
      return dateA - dateB;
    };

    switch (policy) {
      case 'chronological':
        return [...records].sort(chronologicalSort);

      case 'chronological_safety_first': {
        const safety = records.filter(isSafetyPhoto).sort(chronologicalSort);
        const others = records.filter(r => !isSafetyPhoto(r)).sort(chronologicalSort);
        return [...safety, ...others];
      }

      case 'chronological_safety_last': {
        const safety = records.filter(isSafetyPhoto).sort(chronologicalSort);
        const others = records.filter(r => !isSafetyPhoto(r)).sort(chronologicalSort);
        return [...others, ...safety];
      }

      case 'by_detail': {
        const detailOrder = getDetailOrderMap();
        const groups: { [key: string]: PhotoRecord[] } = {};
        records.forEach(r => {
          const key = r.analysis?.detail || r.analysis?.variety || '未分類';
          if (!groups[key]) groups[key] = [];
          groups[key].push(r);
        });
        // マスタ順でソート、マッチしない場合は学習済み順序を使用
        const sortedKeys = Object.keys(groups).sort((a, b) => {
          const masterOrderA = detailOrder.get(a);
          const masterOrderB = detailOrder.get(b);
          // マスタにある場合はマスタ順、なければ学習済み順序を使用
          const orderA = masterOrderA ?? (5000 + getLearnedOrderValue(a));
          const orderB = masterOrderB ?? (5000 + getLearnedOrderValue(b));
          return orderA - orderB;
        });
        return sortedKeys.flatMap(key => groups[key].sort(chronologicalSort));
      }

      case 'by_detail_safety_first': {
        const detailOrderSF = getDetailOrderMap();
        const safety = records.filter(isSafetyPhoto).sort(chronologicalSort);
        const others = records.filter(r => !isSafetyPhoto(r));
        const groups: { [key: string]: PhotoRecord[] } = {};
        others.forEach(r => {
          const key = r.analysis?.detail || r.analysis?.variety || '未分類';
          if (!groups[key]) groups[key] = [];
          groups[key].push(r);
        });
        // マスタ順でソート、マッチしない場合は学習済み順序を使用
        const sortedKeys = Object.keys(groups).sort((a, b) => {
          const masterOrderA = detailOrderSF.get(a);
          const masterOrderB = detailOrderSF.get(b);
          const orderA = masterOrderA ?? (5000 + getLearnedOrderValue(a));
          const orderB = masterOrderB ?? (5000 + getLearnedOrderValue(b));
          return orderA - orderB;
        });
        const sortedOthers = sortedKeys.flatMap(key => groups[key].sort(chronologicalSort));
        return [...safety, ...sortedOthers];
      }

      case 'by_detail_safety_last': {
        const detailOrderSL = getDetailOrderMap();
        const safety = records.filter(isSafetyPhoto).sort(chronologicalSort);
        const others = records.filter(r => !isSafetyPhoto(r));
        const groups: { [key: string]: PhotoRecord[] } = {};
        others.forEach(r => {
          const key = r.analysis?.detail || r.analysis?.variety || '未分類';
          if (!groups[key]) groups[key] = [];
          groups[key].push(r);
        });
        // マスタ順でソート、マッチしない場合は学習済み順序を使用
        const sortedKeys = Object.keys(groups).sort((a, b) => {
          const masterOrderA = detailOrderSL.get(a);
          const masterOrderB = detailOrderSL.get(b);
          const orderA = masterOrderA ?? (5000 + getLearnedOrderValue(a));
          const orderB = masterOrderB ?? (5000 + getLearnedOrderValue(b));
          return orderA - orderB;
        });
        const sortedOthers = sortedKeys.flatMap(key => groups[key].sort(chronologicalSort));
        return [...sortedOthers, ...safety];
      }

      case 'by_worktype': {
        const varietyOrder = getVarietyOrderMap();
        const groups: { [key: string]: PhotoRecord[] } = {};
        records.forEach(r => {
          const key = r.analysis?.workType || '未分類';
          if (!groups[key]) groups[key] = [];
          groups[key].push(r);
        });
        // マスタ順でソート（マスタにないものは末尾）
        const sortedKeys = Object.keys(groups).sort((a, b) => {
          const orderA = varietyOrder.get(a) ?? 9999;
          const orderB = varietyOrder.get(b) ?? 9999;
          return orderA - orderB;
        });
        return sortedKeys.flatMap(key => groups[key].sort(chronologicalSort));
      }

      default:
        return [...records].sort(chronologicalSort);
    }
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

        if (!beforePhoto && (phase === 'before' || remarks.includes("着手前") || remarks.includes("施工前"))) {
          beforePhoto = photo;
          if (photo.analysis) photo.analysis.phase = 'before';
        } else if (!afterPhoto && (phase === 'after' || remarks.includes("完了") || remarks.includes("完成") || remarks.includes("竣工"))) {
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
            phase: ((r.analysis?.remarks || "").includes("着手前") ? 'before' : (r.analysis?.remarks || "").includes("完了") || (r.analysis?.remarks || "").includes("竣工") ? 'after' : 'status') as any
          }
        };
      });

      // 3. Process Visual Candidates (AI)
      let updatedVisual: PhotoRecord[] = [...alreadyPaired];

      if (needsAI.length > 1) {
        try {
          // Use Gemini 3 Pro to group by visual anchors
          const assignments = await assignSceneIds(needsAI, apiKey, addLog, () => shouldAbortRef.current);
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
        ? `${pairCount}組の着手前-完了ペアを作成しました${omittedCount > 0 ? `（${omittedCount}枚を除外）` : ''}`
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
    setSuccessMsg(lang === 'ja' ? "測点・シーン情報に基づいて並び替えました" : "Sorted by Scene & Phase");
  };

  // --- Manual Pairing ---

  const handleOpenManualPairing = (photosToUse: PhotoRecord[]) => {
    setManualPairingPhotos(photosToUse);
    setShowManualPairing(true);
  };

  // ファイルから直接手動ペアリングを開始（AI解析スキップ）
  const handleStartManualPairing = async (files: File[], instruction: string) => {
    setIsProcessing(true);
    setErrorMsg(null);
    clearLogs();
    addLog('手動ペアリングモードで開始...', 'info');
    setInitialInstruction(instruction);
    setActiveInstruction(instruction);

    try {
      // 画像を読み込んでPhotoRecordを作成（解析なし）
      addLog(`${files.length}枚の画像を読み込み中...`, 'info');
      const records: PhotoRecord[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        addLog(`  [${i + 1}/${files.length}] ${file.name}`, 'info');
        const date = await getPhotoDate(file);
        const { base64, mimeType } = await processImageForAI(file);

        records.push({
          fileName: file.name,
          base64,
          mimeType,
          fileSize: file.size,
          lastModified: file.lastModified,
          originalFile: file,
          status: 'pending',
          date,
          fromCache: false
        });
      }

      addLog(`読み込み完了: ${records.length}枚`, 'success');

      // 手動ペアリングモーダルを開く
      setManualPairingPhotos(records);
      setShowManualPairing(true);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "画像読み込みエラー");
      addLog("画像読み込みエラー", 'error', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualPairingComplete = (pairs: Array<{ before: PhotoRecord, after: PhotoRecord, id: string }>) => {
    // プロンプトから測点名を抽出
    const locationName = extractLocationName(activeInstruction || initialInstruction);

    // ペアをPhotoRecord[]に変換
    const pairedPhotos: PhotoRecord[] = [];
    pairs.forEach((pair, index) => {
      const sceneId = `MANUAL_S${index + 1}`;

      const beforePhoto: PhotoRecord = {
        ...pair.before,
        analysis: {
          ...(pair.before.analysis || {
            fileName: pair.before.fileName,
            workType: '',
            variety: '',
            detail: '',
            station: '',
            remarks: '',
            description: '',
            hasBoard: false,
            detectedText: ''
          }),
          sceneId,
          phase: 'before' as const,
          station: locationName,
          remarks: '着手前'
        },
        status: 'done'
      };

      const afterPhoto: PhotoRecord = {
        ...pair.after,
        analysis: {
          ...(pair.after.analysis || {
            fileName: pair.after.fileName,
            workType: '',
            variety: '',
            detail: '',
            station: '',
            remarks: '',
            description: '',
            hasBoard: false,
            detectedText: ''
          }),
          sceneId,
          phase: 'after' as const,
          station: locationName,
          remarks: '竣工'
        },
        status: 'done'
      };

      pairedPhotos.push(beforePhoto, afterPhoto);
    });

    setPhotos(pairedPhotos);
    setStats({
      total: pairedPhotos.length,
      processed: pairedPhotos.length,
      success: pairedPhotos.length,
      failed: 0,
      cached: 0
    });
    setInitialLayout(2); // 2-upレイアウトに切り替え
    setShowPreview(true);
    setShowManualPairing(false);
    setSuccessMsg(lang === 'ja' ? `${pairs.length}組のペアを手動作成しました` : `Created ${pairs.length} pairs manually`);
    addLog(`手動ペアリング完了: ${pairs.length}組`, 'success');
  };

  // 履歴から読み込み（軽量版履歴なのでキャッシュから写真を復元）
  const handleLoadHistory = async (entry: AnalysisHistoryEntry) => {
    setShowHistory(false);
    setIsProcessing(true);
    setCurrentStep('履歴から復元中...');

    try {
      // photoKeysを使ってキャッシュから解析結果を復元
      const records: PhotoRecord[] = [];

      for (let i = 0; i < entry.photoKeys.length; i++) {
        const key = entry.photoKeys[i];
        // キーからファイル情報を抽出（形式: name_size_modified）
        const parts = key.split('_');
        const fileName = parts.slice(0, -2).join('_'); // 最後の2つ以外はファイル名
        const fileSize = parseInt(parts[parts.length - 2]) || 0;
        const lastModified = parseInt(parts[parts.length - 1]) || 0;

        // サムネイルがあれば使用
        const thumbnail = entry.thumbnails?.[i] || '';

        const record: PhotoRecord = {
          fileName,
          base64: thumbnail,
          mimeType: 'image/jpeg',
          fileSize,
          lastModified,
          status: 'done',
          date: lastModified,
          fromCache: true
        };

        // キャッシュから解析結果を取得（キーを直接使用）
        const cachedAnalysis = await getCachedAnalysis(record);
        if (cachedAnalysis) {
          record.analysis = cachedAnalysis;
        }

        records.push(record);
      }

      setPhotos(records);
      setStats({
        total: records.length,
        processed: records.length,
        success: records.length,
        failed: 0,
        cached: records.length
      });
      setInitialInstruction(entry.instruction);
      setActiveInstruction(entry.instruction);
      setShowPreview(true);
      addLog(`履歴読み込み: ${entry.photoCount}枚 (${new Date(entry.createdAt).toLocaleString('ja-JP')})`, 'success');
      setSuccessMsg(`${entry.photoCount}枚の写真を履歴から読み込みました`);
    } catch (err: any) {
      console.error('履歴読み込みエラー:', err);
      setErrorMsg('履歴の読み込みに失敗しました');
      addLog('履歴読み込みエラー', 'error', err);
    } finally {
      setIsProcessing(false);
      setCurrentStep('');
    }
  };

  // --- Pipeline Steps ---

  const handleStartProcessing = async (files: File[], userInstruction: string, useCache: boolean, sortPolicy: SortPolicy = 'by_detail_safety_first') => {
    if (!files || files.length === 0) return;
    setCurrentSortPolicy(sortPolicy); // ソートポリシーを保存
    setPendingInstruction(userInstruction);
    setPendingUseCache(useCache);

    // 1. Initial Validation
    if (files.length > MAX_PHOTOS) {
      const pending: PendingFile[] = [];
      for (const f of files) {
        pending.push({ file: f, date: await getPhotoDate(f) });
      }
      pending.sort((a, b) => a.date - b.date);
      setPendingFiles(pending);
      setSelectionCount(Math.min(pending.length, MAX_PHOTOS));
      return;
    }

    // 2. 工種確認モーダルを表示
    setPendingAnalysisFiles(files);
    setShowWorkTypeConfirm(true);
  };

  // 工種確認後に解析開始
  const handleWorkTypeConfirmed = () => {
    setShowWorkTypeConfirm(false);
    if (pendingAnalysisFiles) {
      startAnalysisPipeline(pendingAnalysisFiles, pendingInstruction, pendingUseCache);
      setPendingAnalysisFiles(null);
    }
  };

  // 工種確認キャンセル
  const handleWorkTypeCancel = () => {
    setShowWorkTypeConfirm(false);
    setPendingAnalysisFiles(null);
  };

  // 工種確認から設定画面へ
  const handleOpenMasterEditorFromConfirm = () => {
    setShowWorkTypeConfirm(false);
    setShowMasterEditor(true);
  };

  const confirmLimitSelection = () => {
    if (!pendingFiles) return;
    const startIndex = selectionStart - 1;
    const selected = pendingFiles.slice(startIndex, startIndex + selectionCount).map(p => p.file);
    setPendingFiles(null);
    // 工種確認モーダルを表示
    setPendingAnalysisFiles(selected);
    setShowWorkTypeConfirm(true);
  };

  const startAnalysisPipeline = async (files: File[], instruction: string, useCache: boolean) => {
    setIsProcessing(true);
    shouldAbortRef.current = false; // Reset abort flag
    setErrorMsg(null);
    setSuccessMsg(null);
    clearLogs();

    // Store initial instruction as active
    setInitialInstruction(instruction);
    setActiveInstruction(instruction);
    addLog(`[INSTRUCTION] Initial: "${instruction.substring(0, 50)}${instruction.length > 50 ? '...' : ''}"`, 'info');

    try {
      // 1. Prepare Records & Check Cache
      addLog(`=== STEP 1/4: 画像準備 ===`, 'info');
      setCurrentStep(lang === 'ja' ? "画像を準備中..." : "Preparing images...");

      const newRecords: PhotoRecord[] = [];
      let cachedCount = 0;
      const totalFiles = files.length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        addLog(`[${i + 1}/${totalFiles}] ${file.name} を読み込み中...`, 'info');
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
          // キャッシュされた解析結果に測点名を追加
          const locationName = extractLocationName(instruction);
          newRecords.push({
            ...tempRecord,
            base64,
            mimeType,
            analysis: {
              ...cachedAnalysis,
              station: locationName  // プロンプトから抽出した測点名を追加
            },
            status: 'done',
            fromCache: true
          });
          cachedCount++;
          addLog(`  ✓ キャッシュから復元`, 'success');
        } else {
          const { base64, mimeType } = await processImageForAI(file);
          newRecords.push({
            ...tempRecord,
            base64,
            mimeType,
            status: 'pending',
            fromCache: false
          });
          addLog(`  → 新規解析が必要`, 'info');
        }
      }

      addLog(`画像準備完了: ${totalFiles}枚 (キャッシュ: ${cachedCount}枚, 新規: ${totalFiles - cachedCount}枚)`, 'success');

      // Initial Sort (Logical - using cached sceneIds if available)
      const initialSorted = sortPhotosLogical(newRecords);
      setPhotos(initialSorted);
      setStats({ total: initialSorted.length, processed: cachedCount, success: cachedCount, failed: 0, cached: cachedCount });
      setShowPreview(true);

      // 2. Smart Flow: 写真タイプを自動判定して最適な処理を選択
      const pendingPhotos = initialSorted.filter(p => p.status === 'pending');

      if (pendingPhotos.length > 0) {
        addLog(`=== STEP 2/4: 写真タイプ判定 ===`, 'info');
        addLog(`${pendingPhotos.length}枚の新規写真をAI解析します`, 'info');

        // スマートフローで処理
        const result = await processPhotosWithSmartFlow(
          pendingPhotos,
          apiKey,
          instruction,
          addLog,
          () => shouldAbortRef.current
        );

        if (result.type === 'paired') {
          // 景観写真モード：ペアリング完了
          addLog(`=== STEP 3/4: 景観ペアリング ===`, 'info');
          addLog(`${result.pairs?.length || 0}組のペアを作成`, 'success');

          // プロンプトから測点名を抽出（共通関数を使用）
          const locationName = extractLocationName(instruction);

          // ペアを展開して写真リストを更新
          const updatedPhotos: PhotoRecord[] = [];
          result.pairs?.forEach(pair => {
            // analysis が存在しない場合は空のオブジェクトで初期化
            const beforeAnalysis = pair.before.analysis || {
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

            // beforeとafterにsceneIdとphaseを付与、測点名と備考を追加
            const beforePhoto = {
              ...pair.before,
              analysis: {
                ...beforeAnalysis,
                sceneId: pair.sceneId,
                phase: 'before' as const,
                station: locationName, // 測点名を追加
                remarks: '着手前' // 備考に着手前を記載
              },
              status: 'done' as const
            };
            const afterPhoto = {
              ...pair.after,
              analysis: {
                ...afterAnalysis,
                sceneId: pair.sceneId,
                phase: 'after' as const,
                station: locationName, // 測点名を追加
                remarks: '竣工' // 備考に竣工を記載
              },
              status: 'done' as const
            };
            updatedPhotos.push(beforePhoto, afterPhoto);
          });

          setPhotos(prev => {
            const unchanged = prev.filter(p => p.status !== 'pending');
            return [...unchanged, ...updatedPhotos];
          });

          setInitialLayout(2); // 2-upレイアウトに自動切り替え
        } else {
          // 黒板ありモード：従来の詳細解析（並列バッチ処理）
          addLog(`=== STEP 3/4: 黒板写真解析 ===`, 'info');
          const batchSize = DEFAULT_BATCH_SIZE;

          // バッチに分割
          const batches: PhotoRecord[][] = [];
          for (let i = 0; i < pendingPhotos.length; i += batchSize) {
            batches.push(pendingPhotos.slice(i, i + batchSize));
          }
          addLog(`${pendingPhotos.length}枚を${batches.length}バッチに分割（${PARALLEL_BATCHES}並列）`, 'info');

          // PARALLEL_BATCHES個ずつ並列実行
          for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
            // Check abort at start of each batch group
            if (shouldAbortRef.current) {
              addLog("解析が中断されました", 'info');
              break;
            }

            const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);
            const processedCount = i * batchSize;
            const currentBatchNum = Math.floor(i / PARALLEL_BATCHES) + 1;
            const totalBatchGroups = Math.ceil(batches.length / PARALLEL_BATCHES);
            addLog(`バッチ ${currentBatchNum}/${totalBatchGroups} 処理中...`, 'info');
            setCurrentStep(`${txt.analyzing} (${processedCount + 1}/${pendingPhotos.length}) - ${parallelBatches.length}並列`);

            const batchPromises = parallelBatches.map(async (batch, idx) => {
              try {
                const results = await analyzePhotoBatch(
                  batch,
                  instruction,
                  batchSize,
                  appMode,
                  apiKey,
                  addLog,
                  logIndividualResult,
                  () => shouldAbortRef.current
                );

                return batch.map(record => {
                  const res = results.find(r => r.fileName === record.fileName);
                  if (res) {
                    cacheAnalysis(record, res).catch(console.error);
                    return { ...record, analysis: res, status: 'done' as const };
                  }
                  return { ...record, status: 'error' as const };
                });
              } catch (e: any) {
                console.error(`Batch ${i + idx} failed`, e);
                addLog(`Batch analysis failed: ${e.message}`, 'error');
                return batch.map(record => ({ ...record, status: 'error' as const }));
              }
            });

            const batchResults = await Promise.all(batchPromises);
            const allUpdated = batchResults.flat();

            setPhotos(prev => prev.map(p => {
              const updated = allUpdated.find(u => u.fileName === p.fileName);
              return updated || p;
            }));
          }
        }
      }

      // 3. Normalize Consistency (Only for NEW records) - With user approval flow
      addLog(`=== STEP 4/4: データ整合性チェック ===`, 'info');

      // Get current photos state using a callback to setPhotos
      let currentPhotos: PhotoRecord[] = [];
      setPhotos(prev => {
        currentPhotos = prev;
        return prev;
      });
      // Wait for state to be readable
      await new Promise(resolve => setTimeout(resolve, 0));

      const newlyAnalyzed = currentPhotos.filter(p => !p.fromCache && p.status === 'done');
      if (newlyAnalyzed.length > 0) {
        addLog(`${newlyAnalyzed.length}枚の解析結果を正規化中...`, 'info');
        setCurrentStep("Finalizing data consistency...");

        const result = await getNormalizationProposals(newlyAnalyzed, apiKey, undefined, addLog, () => shouldAbortRef.current);

        if (result.corrections.length > 0) {
          // Store for modal
          setNormalizationProposals(result.corrections);
          setNormalizationOriginals(newlyAnalyzed.map(p => ({
            fileName: p.fileName,
            workType: p.analysis?.workType || '',
            variety: p.analysis?.variety || '',
            detail: p.analysis?.detail || '',
            station: p.analysis?.station || '',
            remarks: p.analysis?.remarks || ''
          })));
          setPhotosForNormalization(newlyAnalyzed);

          addLog(`${result.corrections.length}件の修正提案があります。ユーザー承認を待機中...`, 'info');
          setShowNormalizationModal(true);

          // Don't proceed with final sort - wait for user approval
          setIsProcessing(false);
          setCurrentStep("");
          return; // Exit pipeline here, continue in approval handler
        } else {
          addLog('修正提案なし - データは整合しています', 'success');
        }
      }

      // 4. Final Sort (Logical)
      // This will use cached sceneIds from previous sessions if they exist!
      setPhotos(prev => {
        const sorted = sortPhotosLogical(prev);
        // 解析履歴を自動保存
        saveAnalysisHistory(sorted, instruction, getSelectedModel())
          .then(entry => addLog(`履歴保存: ${entry.photoCount}枚 (${new Date(entry.createdAt).toLocaleString('ja-JP')})`, 'success'))
          .catch(e => console.error('履歴保存失敗:', e));
        return sorted;
      });

      // 5. エイリアス自動適用（設定が有効な場合）
      const aliasSettings = loadAliasSettings();
      if (aliasSettings.enabled && hasAliases(aliasSettings)) {
        setPhotos(prev => {
          const { modifiedCount, records } = applyAliasesToRecords(prev, aliasSettings);
          if (modifiedCount > 0) {
            addLog(`エイリアス自動適用: ${modifiedCount}件のデータを変換しました`, 'success');
          }
          return records;
        });
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
        (instruction.includes('測点') || instruction.includes('付近') || instruction.includes('地点'));

      if (hasStationOverride) {
        addLog(`[INSTRUCTION] Station override detected: "${refinementStation}"`, 'info');
      }

      // 「全体を再解析」「すべて再解析」などの指示を検出
      const isReanalyzeAllRequest = instruction === "__REANALYZE__" ||
        (instruction && /全体|すべて|全件|全部|all\s*(photos?)?|re-?analyze\s*all/i.test(instruction));

      addLog(`[DEBUG] instruction="${instruction}", isReanalyzeAllRequest=${isReanalyzeAllRequest}, photos.length=${photos.length}`, 'info');

      if (isReanalyzeAllRequest) {
        targetFileNames = photos.map(p => p.fileName);
        addLog(`[DEBUG] targetFileNames.length=${targetFileNames.length}`, 'info');
        if (instruction === "__REANALYZE__") {
          addLog("Re-analyzing ALL photos.", 'info');
        } else {
          addLog(`Re-analyzing ALL photos with instruction: "${instruction}"`, 'info');
        }
      } else {
        setCurrentStep(txt.identifyingTargets);
        targetFileNames = await identifyTargetPhotos(photos, instruction, apiKey, addLog, () => shouldAbortRef.current);
      }

      if (targetFileNames.length === 0) {
        setSuccessMsg("No matching photos found to update.");
        setIsProcessing(false);
        return;
      }

      const targets = photos.filter(p => targetFileNames.includes(p.fileName));
      let updatedTargets: PhotoRecord[] = [];

      // バッチに分割
      const batches: PhotoRecord[][] = [];
      for (let i = 0; i < targets.length; i += batchSize) {
        batches.push(targets.slice(i, i + batchSize));
      }

      // PARALLEL_BATCHES個ずつ並列実行
      for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
        const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);
        const processedCount = i * batchSize;
        setCurrentStep(`${txt.analyzing} (${processedCount + 1}/${targets.length}) - ${parallelBatches.length}並列`);

        const batchPromises = parallelBatches.map(async (batch) => {
          try {
            const results = await analyzePhotoBatch(
              batch,
              instruction === "__REANALYZE__" ? "" : instruction,
              batchSize,
              appMode,
              apiKey,
              addLog,
              logIndividualResult,
              () => shouldAbortRef.current
            );

            return batch.map(record => {
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
          } catch (e: any) {
            addLog(`Refine batch failed: ${e.message}`, 'error');
            return batch;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        updatedTargets = [...updatedTargets, ...batchResults.flat()];
      }

      // Apply station override to updated targets if needed
      if (hasStationOverride && refinementStation) {
        addLog(`[INSTRUCTION] Applying station "${refinementStation}" to all photos`, 'info');
        updatedTargets = updatedTargets.map(p => {
          if (p.analysis) {
            return { ...p, analysis: { ...p.analysis, station: refinementStation } };
          }
          return p;
        });
      }

      // Preserve original order: update photos in place, don't re-sort
      setPhotos(prev => prev.map(p => {
        // Find updated version if exists
        const updated = updatedTargets.find(u => u.fileName === p.fileName);
        if (updated) return updated;

        // Apply station override to non-targets if needed
        if (hasStationOverride && refinementStation && p.analysis) {
          return { ...p, analysis: { ...p.analysis, station: refinementStation } };
        }
        return p;
      }));
      setSuccessMsg(`Updated ${updatedTargets.length} photos.${hasStationOverride ? ` Station set to "${refinementStation}"` : ''}`);

    } catch (e: any) {
      console.error(e);
      setErrorMsg("Refine failed: " + e.message);
    } finally {
      shouldAbortRef.current = false; // Reset abort flag
      setIsProcessing(false);
      setCurrentStep("");
    }
  };

  const handleSingleReanalysis = async (fileName: string) => {
    setIsProcessing(true);
    setCurrentStep(`Re-analyzing ${fileName}...`);
    clearLogs();
    shouldAbortRef.current = false;

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
        () => shouldAbortRef.current,
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

  // Missing handlers added here
  const handleExportJson = () => {
    const json = exportDataToJson(photos);
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, `project_data_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = importDataFromJson(ev.target?.result as string);
        setPhotos(imported);
        setStats({
          total: imported.length,
          processed: imported.length,
          success: imported.length,
          failed: 0,
          cached: 0
        });
        setShowPreview(true);
        addLog(`Imported ${imported.length} photos`, 'success');
      } catch (err) {
        alert("Failed to import JSON");
      }
    };
    reader.readAsText(file);
  };

  // PDFからセッションデータを読み込み
  const handleImportPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const pdfFile = e.target.files[0];

    addLog(`PDF読み込み: ${pdfFile.name}`, 'info');

    try {
      // スマートPDFかどうかチェック
      const isSmart = await isSmartPdf(pdfFile);

      // PDFから埋め込み画像を抽出（先に実行）
      addLog('PDFから画像を抽出中...', 'info');
      const extractedImages = await extractImagesFromPdf(pdfFile);
      addLog(`${extractedImages.length}枚の画像を抽出しました`, 'info');

      let sessionData: Partial<PhotoRecord>[] | null = null;

      if (isSmart) {
        // セッションデータを抽出
        sessionData = await extractSessionFromPdf(pdfFile);
      }

      // セッションデータがない場合、テキスト解析を試みる
      // 画像が抽出できなかった場合はフォルダ選択を提案
      let folderImages: { file: File; base64: string; mimeType: string }[] = [];

      if (!sessionData || sessionData.length === 0) {
        if (extractedImages.length === 0) {
          // 画像がPDFに埋め込まれていない場合、フォルダ選択を提案
          if ('showDirectoryPicker' in window) {
            const shouldSelectFolder = window.confirm(
              lang === 'ja'
                ? 'このPDFから画像を抽出できませんでした。\n画像フォルダを選択して読み込みますか？'
                : 'Could not extract images from this PDF.\nWould you like to select an image folder?'
            );

            if (shouldSelectFolder) {
              try {
                // @ts-ignore - File System Access API
                const dirHandle = await window.showDirectoryPicker();
                addLog('フォルダ選択: 画像を読み込み中...', 'info');

                // フォルダ内の画像ファイルを収集
                for await (const entry of dirHandle.values()) {
                  if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    if (file.type.startsWith('image/')) {
                      const { base64, mimeType } = await processImageForAI(file);
                      folderImages.push({ file, base64, mimeType });
                      addLog(`  ✓ ${file.name}`, 'success');
                    }
                  }
                }

                // ファイル名でソート
                folderImages.sort((a, b) => a.file.name.localeCompare(b.file.name));
                addLog(`${folderImages.length}枚の画像を読み込みました`, 'info');

                if (folderImages.length === 0) {
                  alert(lang === 'ja'
                    ? '選択したフォルダに画像がありませんでした。'
                    : 'No images found in the selected folder.');
                  return;
                }
              } catch (folderErr: any) {
                if (folderErr.name === 'AbortError') {
                  return; // ユーザーがキャンセル
                }
                console.error('Folder selection error:', folderErr);
                setErrorMsg('フォルダ選択エラー');
                return;
              }
            } else {
              return; // ユーザーがキャンセル
            }
          } else {
            alert(lang === 'ja'
              ? 'このPDFから画像を抽出できませんでした。'
              : 'Could not extract images from this PDF.');
            return;
          }
        }

        addLog('セッションデータなし - テキスト解析を試行...', 'info');

        // ユーザーに確認
        const imageCount = folderImages.length > 0 ? folderImages.length : extractedImages.length;
        const shouldProceed = window.confirm(
          lang === 'ja'
            ? `このPDFにはセッションデータが含まれていません。\n${imageCount}枚の画像が見つかりました。\n\nテキストを解析して復元を試みますか？`
            : `This PDF does not contain session data.\nFound ${imageCount} images.\n\nWould you like to try text analysis to restore?`
        );

        if (!shouldProceed) {
          return;
        }

        // テキスト解析を実行
        addLog('PDFテキストを解析中...', 'info');
        const textData = await extractTextWithPositions(pdfFile);

        // フォルダから読み込んだ画像があればそちらを使用
        const actualImageCount = folderImages.length > 0 ? folderImages.length : extractedImages.length;

        // ページ数から1ページあたりの写真数を推測
        const totalPages = textData.length;
        const photosPerPage: 2 | 3 = totalPages > 0 && actualImageCount / totalPages <= 2.5 ? 2 : 3;
        addLog(`レイアウト推定: ${photosPerPage}枚/ページ`, 'info');

        // テキストからセッションデータを生成
        sessionData = parsePositionedTextToRecords(textData, actualImageCount, photosPerPage);
        addLog(`テキスト解析完了: ${sessionData.length}件のレコードを生成`, 'info');
      }

      // セッションデータと画像をマッチング
      let restoredPhotos: PhotoRecord[] = sessionData.map((data, index) => {
        // フォルダから読み込んだ画像があればそちらを優先
        if (folderImages.length > 0 && folderImages[index]) {
          const img = folderImages[index];
          return {
            fileName: img.file.name,
            base64: img.base64,
            mimeType: img.mimeType,
            fileSize: img.file.size,
            lastModified: img.file.lastModified,
            status: (data.status as any) || 'done',
            date: data.date,
            analysis: data.analysis,
            sceneId: data.sceneId,
            phase: data.phase,
            fromCache: false
          };
        }

        const fileName = data.fileName || `photo_${index + 1}.jpg`;

        // 抽出した画像があれば使用（データURL形式で設定）
        let base64 = '';
        if (extractedImages[index]) {
          const bytes = extractedImages[index].data;
          const mimeType = extractedImages[index].mimeType || 'image/jpeg';
          // チャンク処理でパフォーマンス改善
          const chunkSize = 8192;
          let binary = '';
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, Array.from(chunk));
          }
          base64 = `data:${mimeType};base64,${btoa(binary)}`;
        }

        return {
          fileName,
          base64,
          mimeType: extractedImages[index]?.mimeType || data.mimeType || 'image/jpeg',
          fileSize: extractedImages[index]?.data.length || 0,
          lastModified: 0,
          status: (data.status as any) || 'done',
          date: data.date,
          analysis: data.analysis,
          sceneId: data.sceneId,
          phase: data.phase,
          fromCache: true
        };
      });

      let matchedCount = restoredPhotos.filter(p => p.base64).length;

      // PDFから画像が取得できなかった場合、フォルダ選択を提案
      const missingCount = restoredPhotos.length - matchedCount;
      if (missingCount > 0 && 'showDirectoryPicker' in window) {
        const shouldSelectFolder = window.confirm(
          lang === 'ja'
            ? `${missingCount}枚の画像がPDFから抽出できませんでした。\n元の画像フォルダを選択して復元しますか？`
            : `${missingCount} images could not be extracted from PDF.\nSelect the original image folder to restore?`
        );

        if (shouldSelectFolder) {
          try {
            // @ts-ignore - File System Access API
            const dirHandle = await window.showDirectoryPicker();
            addLog('フォルダ選択: 画像を検索中...', 'info');

            // フォルダ内のファイルを検索
            for await (const entry of dirHandle.values()) {
              if (entry.kind === 'file') {
                const missingPhoto = restoredPhotos.find(p => p.fileName === entry.name && !p.base64);
                if (missingPhoto) {
                  const file = await entry.getFile();
                  const { base64, mimeType } = await processImageForAI(file);
                  missingPhoto.base64 = base64;
                  missingPhoto.mimeType = mimeType;
                  missingPhoto.fileSize = file.size;
                  missingPhoto.lastModified = file.lastModified;
                  matchedCount++;
                  addLog(`  ✓ ${entry.name}`, 'success');
                }
              }
            }
          } catch (folderErr: any) {
            if (folderErr.name !== 'AbortError') {
              console.error('Folder selection error:', folderErr);
              addLog('フォルダ選択エラー', 'error');
            }
          }
        }
      }

      setPhotos(restoredPhotos);
      setStats({
        total: restoredPhotos.length,
        processed: restoredPhotos.length,
        success: restoredPhotos.length,
        failed: 0,
        cached: restoredPhotos.length
      });
      setShowPreview(true);

      if (matchedCount === restoredPhotos.length) {
        addLog(`PDFから${restoredPhotos.length}枚を完全復元しました`, 'success');
        setSuccessMsg(`PDFから${restoredPhotos.length}枚を完全復元しました`);
      } else if (matchedCount > 0) {
        addLog(`PDFから${restoredPhotos.length}枚中${matchedCount}枚の画像を復元しました`, 'success');
        setSuccessMsg(`${restoredPhotos.length}枚中${matchedCount}枚の画像を復元しました`);
      } else {
        addLog(`PDFから${restoredPhotos.length}枚の解析データを復元しました（画像なし）`, 'info');
        setSuccessMsg(`${restoredPhotos.length}枚の解析データを復元しました（画像なし）`);
      }

    } catch (err: any) {
      console.error('PDF import error:', err);
      setErrorMsg(err.message || 'PDF読み込みエラー');
      addLog('PDF読み込みエラー', 'error', err);
    }

    // Reset input
    e.target.value = '';
  };

  // --- Render ---

  return (
    <>
      {/* API Key Setup - Step 1: キー入力 */}
      {showApiKeySetup && (
        <ApiKeySetup
          onComplete={handleApiKeyInput}
          onCancel={() => setShowApiKeySetup(false)}
          onImportPdf={(e) => {
            setShowApiKeySetup(false);
            handleImportPdf(e);
          }}
        />
      )}

      {/* Model Validation - Step 2: モデル検証・選択 */}
      {showModelValidation && pendingApiKey && (
        <ModelValidation
          apiKey={pendingApiKey}
          onComplete={handleModelValidationComplete}
          onBack={handleModelValidationBack}
        />
      )}

      {showMasterEditor ? (
        <MasterEditorModal
          lang={lang}
          onClose={() => setShowMasterEditor(false)}
          onApplyAliasesToSession={() => {
            const settings = loadAliasSettings();
            if (!settings.enabled || !hasAliases(settings)) {
              return { modifiedCount: 0 };
            }
            const { modifiedCount, records } = applyAliasesToRecords(photos, settings);
            if (modifiedCount > 0) {
              setPhotos(records);
              addLog(`エイリアス適用: ${modifiedCount}件のデータを変換しました`, 'success');
            }
            return { modifiedCount };
          }}
        />
      ) : !showPreview ? (
        <UploadView
          lang={lang}
          isProcessing={isProcessing}
          photos={photos}
          appMode={appMode}
          apiKey={apiKey || ''}
          setAppMode={setAppMode}
          onStartProcessing={handleStartProcessing}
          onResume={handleResume}
          onCloseProject={handleCloseProject}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onImportPdf={handleImportPdf}
          onClearCache={handleClearCache}
          onShowPreview={() => setShowPreview(true)}
          onOpenSettings={() => setShowApiKeySetup(true)}
          onManualPairing={handleStartManualPairing}
          onShowHistory={() => setShowHistory(true)}
          onOpenMasterEditor={() => setShowMasterEditor(true)}
        />
      ) : (
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
        onGoHome={() => { shouldAbortRef.current = true; setShowPreview(false); setInitialLayout(3); }}
        onCloseProject={handleCloseProject}
        onRefine={() => setShowRefineModal(true)}
        onExportExcel={(layout) => generateExcel(photos, appMode, layout)}
        onUpdatePhoto={handleUpdatePhoto}
        onDeletePhoto={handleDeletePhoto}
        onAutoPair={handleAutoPair}
        onManualPair={() => handleOpenManualPairing(photos)}
        onSortByDate={handleSmartSort}
        onSendInstruction={handleConsoleInstruction}
        onSelectCacheFolder={handleSelectCacheFolder}
        onClearFileSystemCache={handleClearFileSystemCache}
        onReanalyzePhoto={handleSingleReanalysis}
        onAbort={() => { shouldAbortRef.current = true; addLog("解析を中断しています...", 'info'); }}
        onOpenMasterEditor={() => setShowMasterEditor(true)}
        onReorderPhotos={handleReorderPhotos}
        onOpenStationReplace={() => setShowStationReplace(true)}
        onApplyAliases={() => {
          const settings = loadAliasSettings();
          if (!settings.enabled || !hasAliases(settings)) {
            return { modifiedCount: 0 };
          }
          const { modifiedCount, records } = applyAliasesToRecords(photos, settings);
          if (modifiedCount > 0) {
            setPhotos(records);
            addLog(`エイリアス適用: ${modifiedCount}件のデータを変換しました`, 'success');
          }
          return { modifiedCount };
        }}
        onOpenGitHubSync={() => setShowGitHubSync(true)}
      />
      )}

      {/* Usage Panel - only shown in preview mode */}
      {showPreview && (
        <UsagePanel
          photoCount={photos.length}
          totalImageSize={photos.reduce((sum, p) => sum + (p.base64?.length || 0) * 0.75, 0)}
        />
      )}

      {/* Modals - always rendered regardless of showPreview */}
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

      {showManualPairing && (
        <ManualPairingModal
          photos={manualPairingPhotos}
          lang={lang}
          onComplete={handleManualPairingComplete}
          onCancel={() => setShowManualPairing(false)}
        />
      )}

      {showStationReplace && (
        <StationReplaceModal
          photos={photos}
          lang={lang}
          onClose={() => setShowStationReplace(false)}
          onReplace={handleStationReplace}
        />
      )}

      {showNormalizationModal && (
        <NormalizationPreviewModal
          corrections={normalizationProposals}
          originalData={normalizationOriginals}
          onApprove={handleNormalizationApprove}
          onReject={handleNormalizationReject}
          onRetry={handleNormalizationRetry}
          lang={lang}
        />
      )}

      {showHistory && (
        <SessionHistoryPanel
          onLoad={handleLoadHistory}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showGitHubSync && (
        <GitHubSyncPanel
          onClose={() => setShowGitHubSync(false)}
        />
      )}

      {showWorkTypeConfirm && (
        <WorkTypeConfirmModal
          lang={lang}
          onConfirm={handleWorkTypeConfirmed}
          onCancel={handleWorkTypeCancel}
          onOpenSettings={handleOpenMasterEditorFromConfirm}
        />
      )}
    </>
  );
}