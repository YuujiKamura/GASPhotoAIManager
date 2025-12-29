import { useCallback, useRef } from 'react';
import { PhotoRecord, AIAnalysisResult, AppMode, SortPolicy, LogEntry, AnalysisHistoryEntry } from '../types';
import { processImageForAI, getPhotoDate } from '../utils/imageUtils';
import { analyzePhotoBatch, identifyTargetPhotos, getNormalizationProposals, assignSceneIds, getSelectedModel, NormalizationCorrection } from '../services/geminiService';
import { processPhotosWithSmartFlow } from '../services/smartFlowService';
import { getCachedAnalysis, cacheAnalysis, saveAnalysisHistory } from '../utils/storage';
import { runAIAgent } from '../services/aiAgentService';
import { loadAliasSettings, hasAliases, applyAliasesToRecords } from '../utils/workTypeAliases';
import { extractLocationName } from '../utils/locationUtils';
import { sortPhotosLogical, normalizeStationName, arrangePairsStrictly } from '../utils/sortingUtils';
import { OriginalData } from '../components/NormalizationPreviewModal';

const DEFAULT_BATCH_SIZE = 6;
const PARALLEL_BATCHES = 2;

interface UseAnalysisHandlersProps {
  apiKey: string | null;
  photos: PhotoRecord[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  stats: any;
  setStats: React.Dispatch<React.SetStateAction<any>>;
  appMode: AppMode;
  lang: 'en' | 'ja';
  currentSortPolicy: SortPolicy;
  addLog: (message: string, type?: LogEntry['type'], details?: any) => void;
  setIsProcessing: (v: boolean) => void;
  setCurrentStep: (v: string) => void;
  setErrorMsg: (v: string | null) => void;
  setSuccessMsg: (v: string | null) => void;
  setShowPreview: (v: boolean) => void;
  setInitialLayout: (v: 2 | 3) => void;
  setShowNormalizationModal: (v: boolean) => void;
  setNormalizationProposals: (v: NormalizationCorrection[]) => void;
  setNormalizationOriginals: (v: OriginalData[]) => void;
  setPhotosForNormalization: (v: PhotoRecord[]) => void;
  setManualPairingPhotos: (v: PhotoRecord[]) => void;
  setShowManualPairing: (v: boolean) => void;
  setShowHistory: (v: boolean) => void;
  setIsAskingAI: (v: boolean) => void;
  initialInstruction: string;
  setInitialInstruction: (v: string) => void;
  activeInstruction: string;
  setActiveInstruction: (v: string) => void;
  txt: any;
}

// ヘルパー関数
const createDefaultAnalysis = (fileName: string): AIAnalysisResult => ({
  fileName, workType: '', variety: '', detail: '', station: '', remarks: '', description: '', hasBoard: false, detectedText: ''
});

const createBatches = <T,>(items: T[], size: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
};

const loadPhotoFromFile = async (file: File): Promise<PhotoRecord> => {
  const date = await getPhotoDate(file);
  const { base64, mimeType } = await processImageForAI(file);
  return { fileName: file.name, base64, mimeType, fileSize: file.size, lastModified: file.lastModified, originalFile: file, status: 'pending', date, fromCache: false };
};

export function useAnalysisHandlers(props: UseAnalysisHandlersProps) {
  const { apiKey, photos, setPhotos, setStats, appMode, lang, currentSortPolicy, addLog, setIsProcessing, setCurrentStep,
    setErrorMsg, setSuccessMsg, setShowPreview, setInitialLayout, setShowNormalizationModal, setNormalizationProposals,
    setNormalizationOriginals, setPhotosForNormalization, setManualPairingPhotos, setShowManualPairing, setShowHistory,
    setIsAskingAI, initialInstruction, setInitialInstruction, activeInstruction, setActiveInstruction, txt } = props;

  const shouldAbortRef = useRef(false);

  const withProcessing = async <T,>(fn: () => Promise<T>, cleanup = true): Promise<T | undefined> => {
    setIsProcessing(true);
    try { return await fn(); }
    catch (err: any) { setErrorMsg(err.message || 'Error'); addLog('Error', 'error', err); return undefined; }
    finally { if (cleanup) { setIsProcessing(false); setCurrentStep(''); } }
  };

  const processBatchesParallel = async (
    targets: PhotoRecord[], instruction: string, batchSize: number,
    onResult: (record: PhotoRecord, result: AIAnalysisResult) => PhotoRecord
  ): Promise<PhotoRecord[]> => {
    const batches = createBatches(targets, batchSize);
    const results: PhotoRecord[] = [];
    for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
      if (shouldAbortRef.current) break;
      const parallel = batches.slice(i, i + PARALLEL_BATCHES);
      setCurrentStep(`${txt.analyzing} (${i * batchSize + 1}/${targets.length})`);
      const batchResults = await Promise.all(parallel.map(async batch => {
        if (!apiKey) return batch;
        try {
          const results = await analyzePhotoBatch(batch, instruction, batchSize, appMode, apiKey, addLog, (fn, r) => addLog(`📸 ${fn} | ${r.workType}`, 'success', r), () => shouldAbortRef.current);
          return batch.map(rec => {
            const res = results.find(r => r.fileName === rec.fileName);
            return res ? onResult(rec, res) : { ...rec, status: 'error' as const };
          });
        } catch (e: any) { addLog(`Batch failed: ${e.message}`, 'error'); return batch.map(r => ({ ...r, status: 'error' as const })); }
      }));
      results.push(...batchResults.flat());
    }
    return results;
  };

  const handleAskAI = useCallback(async (prompt: string): Promise<string> => {
    setIsAskingAI(true);
    try {
      addLog(`[AIエージェント] リクエスト: ${prompt.substring(0, 50)}...`, 'info');
      const response = await runAIAgent(prompt, log => addLog(log, 'info'));
      addLog('[AIエージェント] 完了', 'success');
      return response;
    } catch (err: any) { addLog(`[AIエージェント] エラー: ${err.message}`, 'error'); throw err; }
    finally { setIsAskingAI(false); }
  }, [addLog, setIsAskingAI]);

  const handleAutoPair = useCallback(async () => {
    if (!apiKey) { alert(txt.permissionError); return; }
    await withProcessing(async () => {
      setCurrentStep(txt.pairingProcessing);
      const records = [...photos];
      const alreadyPaired = records.filter(r => r.analysis?.sceneId?.startsWith('AI_S'));
      const hasStation = records.filter(r => !r.analysis?.sceneId?.startsWith('AI_S') && normalizeStationName(r.analysis?.station) !== 'UNKNOWN');
      const needsAI = records.filter(r => !r.analysis?.sceneId?.startsWith('AI_S') && normalizeStationName(r.analysis?.station) === 'UNKNOWN');

      const updatedHasStation = hasStation.map(r => {
        const station = normalizeStationName(r.analysis?.station);
        const remarks = r.analysis?.remarks || '';
        return { ...r, analysis: { ...r.analysis!, sceneId: `LOGICAL_${station}`, phase: (remarks.includes('着手前') ? 'before' : remarks.includes('完了') || remarks.includes('竣工') ? 'after' : 'status') as any } };
      });

      let updatedVisual = [...alreadyPaired];
      if (needsAI.length > 1) {
        try {
          const assignments = await assignSceneIds(needsAI, apiKey, addLog, () => shouldAbortRef.current);
          const map = new Map(assignments.map(a => [a.fileName, a]));
          updatedVisual.push(...needsAI.map(r => {
            const a = map.get(r.fileName);
            return a ? { ...r, analysis: { ...r.analysis!, sceneId: `AI_${a.sceneId}`, phase: a.phase, visualAnchors: a.visualAnchors } } : r;
          }));
          addLog(`Visual pairing: ${assignments.length} photos.`, 'success');
        } catch { addLog('Visual pairing failed', 'error'); updatedVisual.push(...needsAI); }
      } else { updatedVisual.push(...needsAI); }

      const allUpdated = [...updatedHasStation, ...updatedVisual];
      allUpdated.forEach(r => r.analysis && cacheAnalysis(r, r.analysis).catch(() => {}));
      const { sorted, pairCount, omittedCount } = arrangePairsStrictly(allUpdated);
      setPhotos(sorted);
      setSuccessMsg(lang === 'ja' ? `${pairCount}組のペアを作成${omittedCount > 0 ? `（${omittedCount}枚除外）` : ''}` : `Created ${pairCount} pairs`);
    });
  }, [apiKey, photos, setPhotos, lang, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, txt]);

  const handleSmartSort = useCallback(() => {
    setPhotos(sortPhotosLogical([...photos], currentSortPolicy));
    setSuccessMsg(lang === 'ja' ? '並び替え完了' : 'Sorted');
  }, [photos, setPhotos, currentSortPolicy, lang, setSuccessMsg]);

  const handleStartManualPairing = useCallback(async (files: File[], instruction: string) => {
    await withProcessing(async () => {
      setInitialInstruction(instruction);
      setActiveInstruction(instruction);
      addLog(`${files.length}枚読み込み中...`, 'info');
      const records = await Promise.all(files.map(loadPhotoFromFile));
      setManualPairingPhotos(records);
      setShowManualPairing(true);
      addLog(`読み込み完了: ${records.length}枚`, 'success');
    });
  }, [addLog, setIsProcessing, setErrorMsg, setInitialInstruction, setActiveInstruction, setManualPairingPhotos, setShowManualPairing]);

  const handleManualPairingComplete = useCallback((pairs: Array<{ before: PhotoRecord, after: PhotoRecord, id: string }>) => {
    const locationName = extractLocationName(activeInstruction || initialInstruction);
    const pairedPhotos = pairs.flatMap((pair, i) => {
      const sceneId = `MANUAL_S${i + 1}`;
      const mkPhoto = (p: PhotoRecord, phase: 'before' | 'after', remarks: string): PhotoRecord => ({
        ...p, status: 'done', analysis: { ...(p.analysis || createDefaultAnalysis(p.fileName)), sceneId, phase, station: locationName, remarks }
      });
      return [mkPhoto(pair.before, 'before', '着手前'), mkPhoto(pair.after, 'after', '竣工')];
    });
    setPhotos(pairedPhotos);
    setStats({ total: pairedPhotos.length, processed: pairedPhotos.length, success: pairedPhotos.length, failed: 0, cached: 0 });
    setInitialLayout(2);
    setShowPreview(true);
    setShowManualPairing(false);
    setSuccessMsg(lang === 'ja' ? `${pairs.length}組作成` : `Created ${pairs.length} pairs`);
  }, [activeInstruction, initialInstruction, setPhotos, setStats, setInitialLayout, setShowPreview, setShowManualPairing, setSuccessMsg, lang]);

  const handleLoadHistory = useCallback(async (entry: AnalysisHistoryEntry) => {
    setShowHistory(false);
    await withProcessing(async () => {
      setCurrentStep('履歴復元中...');
      const records = await Promise.all(entry.photoKeys.map(async (key, i) => {
        const parts = key.split('_');
        const fileName = parts.slice(0, -2).join('_');
        const record: PhotoRecord = { fileName, base64: entry.thumbnails?.[i] || '', mimeType: 'image/jpeg', fileSize: parseInt(parts[parts.length - 2]) || 0, lastModified: parseInt(parts[parts.length - 1]) || 0, status: 'done', date: parseInt(parts[parts.length - 1]) || 0, fromCache: true };
        const cached = await getCachedAnalysis(record);
        if (cached) record.analysis = cached;
        return record;
      }));
      setPhotos(records);
      setStats({ total: records.length, processed: records.length, success: records.length, failed: 0, cached: records.length });
      setInitialInstruction(entry.instruction);
      setActiveInstruction(entry.instruction);
      setShowPreview(true);
      setSuccessMsg(`${entry.photoCount}枚を履歴から読み込み`);
    });
  }, [setShowHistory, setIsProcessing, setCurrentStep, setPhotos, setStats, setInitialInstruction, setActiveInstruction, setShowPreview, setSuccessMsg, setErrorMsg, addLog]);

  const startAnalysisPipeline = useCallback(async (files: File[], instruction: string, useCache: boolean) => {
    shouldAbortRef.current = false;
    setErrorMsg(null);
    setSuccessMsg(null);
    setInitialInstruction(instruction);
    setActiveInstruction(instruction);

    await withProcessing(async () => {
      setCurrentStep(lang === 'ja' ? '画像準備中...' : 'Preparing...');
      const newRecords: PhotoRecord[] = [];
      let cachedCount = 0;

      for (const file of files) {
        const date = await getPhotoDate(file);
        const tempRecord: PhotoRecord = { fileName: file.name, base64: '', mimeType: file.type, fileSize: file.size, lastModified: file.lastModified, originalFile: file, status: 'pending', date, fromCache: false };
        const cachedAnalysis = useCache ? await getCachedAnalysis(file) : null;
        const { base64, mimeType } = await processImageForAI(file);
        if (cachedAnalysis) {
          newRecords.push({ ...tempRecord, base64, mimeType, analysis: { ...cachedAnalysis, station: extractLocationName(instruction) }, status: 'done', fromCache: true });
          cachedCount++;
        } else {
          newRecords.push({ ...tempRecord, base64, mimeType });
        }
      }

      const initialSorted = sortPhotosLogical(newRecords, currentSortPolicy);
      setPhotos(initialSorted);
      setStats({ total: initialSorted.length, processed: cachedCount, success: cachedCount, failed: 0, cached: cachedCount });
      setShowPreview(true);

      const pendingPhotos = initialSorted.filter(p => p.status === 'pending');
      if (pendingPhotos.length > 0 && apiKey) {
        const result = await processPhotosWithSmartFlow(pendingPhotos, apiKey, instruction, addLog, () => shouldAbortRef.current);
        if (result.type === 'paired') {
          const locationName = extractLocationName(instruction);
          const updatedPhotos = result.pairs?.flatMap(pair => {
            const mk = (p: PhotoRecord, phase: 'before' | 'after', remarks: string): PhotoRecord => ({
              ...p, status: 'done', analysis: { ...(p.analysis || createDefaultAnalysis(p.fileName)), sceneId: pair.sceneId, phase, station: locationName, remarks }
            });
            return [mk(pair.before, 'before', '着手前'), mk(pair.after, 'after', '竣工')];
          }) || [];
          setPhotos(prev => [...prev.filter(p => p.status !== 'pending'), ...updatedPhotos]);
          setInitialLayout(2);
        } else {
          const updated = await processBatchesParallel(pendingPhotos, instruction, DEFAULT_BATCH_SIZE, (rec, res) => {
            cacheAnalysis(rec, res).catch(() => {});
            return { ...rec, analysis: res, status: 'done' as const };
          });
          setPhotos(prev => prev.map(p => updated.find(u => u.fileName === p.fileName) || p));
        }
      }

      // Normalization
      let currentPhotos: PhotoRecord[] = [];
      setPhotos(prev => { currentPhotos = prev; return prev; });
      await new Promise(r => setTimeout(r, 0));
      const newlyAnalyzed = currentPhotos.filter(p => !p.fromCache && p.status === 'done');
      if (newlyAnalyzed.length > 0 && apiKey) {
        const normResult = await getNormalizationProposals(newlyAnalyzed, apiKey, undefined, addLog, () => shouldAbortRef.current);
        if (normResult.corrections.length > 0) {
          setNormalizationProposals(normResult.corrections);
          setNormalizationOriginals(newlyAnalyzed.map(p => ({ fileName: p.fileName, workType: p.analysis?.workType || '', variety: p.analysis?.variety || '', detail: p.analysis?.detail || '', station: p.analysis?.station || '', remarks: p.analysis?.remarks || '' })));
          setPhotosForNormalization(newlyAnalyzed);
          setShowNormalizationModal(true);
          setIsProcessing(false);
          setCurrentStep('');
          return;
        }
      }

      setPhotos(prev => {
        const sorted = sortPhotosLogical(prev, currentSortPolicy);
        saveAnalysisHistory(sorted, instruction, getSelectedModel()).catch(() => {});
        return sorted;
      });

      const aliasSettings = loadAliasSettings();
      if (aliasSettings.enabled && hasAliases(aliasSettings)) {
        setPhotos(prev => applyAliasesToRecords(prev, aliasSettings).records);
      }
      setSuccessMsg(txt.done);
    }, false);
    setIsProcessing(false);
    setCurrentStep('');
  }, [apiKey, appMode, lang, currentSortPolicy, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setStats, setShowPreview, setInitialLayout, setInitialInstruction, setActiveInstruction, setShowNormalizationModal, setNormalizationProposals, setNormalizationOriginals, setPhotosForNormalization, txt]);

  const handleRefineAnalysis = useCallback(async (instruction: string, batchSize: number) => {
    await withProcessing(async () => {
      setCurrentStep('Refining...');
      if (instruction && instruction !== '__REANALYZE__') setActiveInstruction(instruction);

      const refinementStation = extractLocationName(instruction);
      const hasStationOverride = instruction && instruction !== '__REANALYZE__' && (instruction.includes('測点') || instruction.includes('付近') || instruction.includes('地点'));
      const isReanalyzeAll = instruction === '__REANALYZE__' || /全体|すべて|全件|全部|all\s*(photos?)?|re-?analyze\s*all/i.test(instruction);

      let targetFileNames = isReanalyzeAll ? photos.map(p => p.fileName) : apiKey ? await identifyTargetPhotos(photos, instruction, apiKey, addLog, () => shouldAbortRef.current) : [];
      if (targetFileNames.length === 0) { setSuccessMsg('No matching photos'); return; }

      const targets = photos.filter(p => targetFileNames.includes(p.fileName));
      let updatedTargets = await processBatchesParallel(targets, instruction === '__REANALYZE__' ? '' : instruction, batchSize, (rec, res) => {
        let final = res;
        if (rec.analysis?.editedFields) {
          final = { ...res, editedFields: rec.analysis.editedFields };
          rec.analysis.editedFields.forEach(f => (final as any)[f] = (rec.analysis as any)[f]);
        }
        if (rec.analysis?.sceneId) { final.sceneId = rec.analysis.sceneId; final.phase = rec.analysis.phase; final.visualAnchors = rec.analysis.visualAnchors; }
        cacheAnalysis(rec, final).catch(() => {});
        return { ...rec, analysis: final, status: 'done' as const };
      });

      if (hasStationOverride && refinementStation) {
        updatedTargets = updatedTargets.map(p => p.analysis ? { ...p, analysis: { ...p.analysis, station: refinementStation } } : p);
      }

      setPhotos(prev => prev.map(p => {
        const updated = updatedTargets.find(u => u.fileName === p.fileName);
        if (updated) return updated;
        if (hasStationOverride && refinementStation && p.analysis) return { ...p, analysis: { ...p.analysis, station: refinementStation } };
        return p;
      }));
      setSuccessMsg(`Updated ${updatedTargets.length} photos`);
    });
    shouldAbortRef.current = false;
  }, [apiKey, photos, appMode, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setActiveInstruction, txt]);

  return { shouldAbortRef, handleAskAI, handleAutoPair, handleSmartSort, handleStartManualPairing, handleManualPairingComplete, handleLoadHistory, startAnalysisPipeline, handleRefineAnalysis };
}
