import { useCallback, useRef } from 'react';
import { PhotoRecord, AIAnalysisResult, AppMode, SortPolicy, LogEntry, AnalysisHistoryEntry } from '../types';
import { processImageForAI, getPhotoDate } from '../utils/imageUtils';
import { analyzePhotoBatch, identifyTargetPhotos, getNormalizationProposals, assignSceneIds, getSelectedModel, NormalizationCorrection } from '../services/geminiService';
import { processPhotosWithSmartFlow } from '../services/smartFlowService';
import { getCachedAnalysis, cacheAnalysis, saveAnalysisHistory, getAnalysisHistoryEntry } from '../utils/storage';
import { runAIAgent } from '../services/aiAgentService';
import { loadAliasSettings, hasAliases, applyAliasesToRecords } from '../utils/workTypeAliases';
import { extractLocationName } from '../utils/locationUtils';
import { sortPhotosLogical, normalizeStationName, arrangePairsStrictly } from '../utils/sortingUtils';
import { OriginalData } from '../components/NormalizationPreviewModal';

const DEFAULT_BATCH_SIZE = 6;
const PARALLEL_BATCHES = 2;
const MAX_PHOTOS = 30;

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

export function useAnalysisHandlers({
  apiKey,
  photos,
  setPhotos,
  stats,
  setStats,
  appMode,
  lang,
  currentSortPolicy,
  addLog,
  setIsProcessing,
  setCurrentStep,
  setErrorMsg,
  setSuccessMsg,
  setShowPreview,
  setInitialLayout,
  setShowNormalizationModal,
  setNormalizationProposals,
  setNormalizationOriginals,
  setPhotosForNormalization,
  setManualPairingPhotos,
  setShowManualPairing,
  setShowHistory,
  setIsAskingAI,
  initialInstruction,
  setInitialInstruction,
  activeInstruction,
  setActiveInstruction,
  txt,
}: UseAnalysisHandlersProps) {
  const shouldAbortRef = useRef(false);

  const logIndividualResult = useCallback((fileName: string, result: AIAnalysisResult) => {
    const summary = [
      `📸 ${fileName}`,
      result.workType && `工種: ${result.workType}`,
      result.variety && `種別: ${result.variety}`,
      result.detail && `細別: ${result.detail}`,
      result.station && `測点: ${result.station}`,
      result.remarks && `備考: ${result.remarks}`,
    ].filter(Boolean).join(' | ');
    addLog(summary, 'success', result);
  }, [addLog]);

  // AIエージェントにリクエスト
  const handleAskAI = useCallback(async (prompt: string): Promise<string> => {
    setIsAskingAI(true);
    try {
      addLog(`[AIエージェント] リクエスト: ${prompt.substring(0, 50)}...`, 'info');
      const response = await runAIAgent(prompt, (log) => addLog(log, 'info'));
      addLog('[AIエージェント] 完了', 'success');
      return response;
    } catch (err: any) {
      addLog(`[AIエージェント] エラー: ${err.message}`, 'error');
      throw err;
    } finally {
      setIsAskingAI(false);
    }
  }, [addLog, setIsAskingAI]);

  // 自動ペアリング
  const handleAutoPair = useCallback(async () => {
    if (!apiKey) {
      alert(txt.permissionError);
      return;
    }

    setIsProcessing(true);
    setCurrentStep(txt.pairingProcessing);

    try {
      const records = [...photos];
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

      const updatedHasStation = hasStation.map(r => {
        const station = normalizeStationName(r.analysis?.station);
        return {
          ...r,
          analysis: {
            ...r.analysis!,
            sceneId: `LOGICAL_${station}`,
            phase: ((r.analysis?.remarks || "").includes("着手前") ? 'before' : (r.analysis?.remarks || "").includes("完了") || (r.analysis?.remarks || "").includes("竣工") ? 'after' : 'status') as any
          }
        };
      });

      let updatedVisual: PhotoRecord[] = [...alreadyPaired];

      if (needsAI.length > 1) {
        try {
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

      const allUpdated = [...updatedHasStation, ...updatedVisual];
      allUpdated.forEach(r => {
        if (r.analysis) {
          cacheAnalysis(r, r.analysis).catch(console.error);
        }
      });

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
  }, [apiKey, photos, setPhotos, lang, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, txt]);

  // スマートソート
  const handleSmartSort = useCallback(() => {
    const sorted = sortPhotosLogical([...photos], currentSortPolicy);
    setPhotos(sorted);
    setSuccessMsg(lang === 'ja' ? "測点・シーン情報に基づいて並び替えました" : "Sorted by Scene & Phase");
  }, [photos, setPhotos, currentSortPolicy, lang, setSuccessMsg]);

  // 手動ペアリング開始
  const handleStartManualPairing = useCallback(async (files: File[], instruction: string) => {
    setIsProcessing(true);
    setErrorMsg(null);
    addLog('手動ペアリングモードで開始...', 'info');
    setInitialInstruction(instruction);
    setActiveInstruction(instruction);

    try {
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
      setManualPairingPhotos(records);
      setShowManualPairing(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "画像読み込みエラー");
      addLog("画像読み込みエラー", 'error', err);
    } finally {
      setIsProcessing(false);
    }
  }, [addLog, setIsProcessing, setErrorMsg, setInitialInstruction, setActiveInstruction, setManualPairingPhotos, setShowManualPairing]);

  // 手動ペアリング完了
  const handleManualPairingComplete = useCallback((pairs: Array<{ before: PhotoRecord, after: PhotoRecord, id: string }>) => {
    const locationName = extractLocationName(activeInstruction || initialInstruction);
    const pairedPhotos: PhotoRecord[] = [];

    pairs.forEach((pair, index) => {
      const sceneId = `MANUAL_S${index + 1}`;
      const beforePhoto: PhotoRecord = {
        ...pair.before,
        analysis: {
          ...(pair.before.analysis || { fileName: pair.before.fileName, workType: '', variety: '', detail: '', station: '', remarks: '', description: '', hasBoard: false, detectedText: '' }),
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
          ...(pair.after.analysis || { fileName: pair.after.fileName, workType: '', variety: '', detail: '', station: '', remarks: '', description: '', hasBoard: false, detectedText: '' }),
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
    setStats({ total: pairedPhotos.length, processed: pairedPhotos.length, success: pairedPhotos.length, failed: 0, cached: 0 });
    setInitialLayout(2);
    setShowPreview(true);
    setShowManualPairing(false);
    setSuccessMsg(lang === 'ja' ? `${pairs.length}組のペアを手動作成しました` : `Created ${pairs.length} pairs manually`);
    addLog(`手動ペアリング完了: ${pairs.length}組`, 'success');
  }, [activeInstruction, initialInstruction, setPhotos, setStats, setInitialLayout, setShowPreview, setShowManualPairing, setSuccessMsg, addLog, lang]);

  // 履歴から読み込み
  const handleLoadHistory = useCallback(async (entry: AnalysisHistoryEntry) => {
    setShowHistory(false);
    setIsProcessing(true);
    setCurrentStep('履歴から復元中...');

    try {
      const records: PhotoRecord[] = [];

      for (let i = 0; i < entry.photoKeys.length; i++) {
        const key = entry.photoKeys[i];
        const parts = key.split('_');
        const fileName = parts.slice(0, -2).join('_');
        const fileSize = parseInt(parts[parts.length - 2]) || 0;
        const lastModified = parseInt(parts[parts.length - 1]) || 0;
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

        const cachedAnalysis = await getCachedAnalysis(record);
        if (cachedAnalysis) {
          record.analysis = cachedAnalysis;
        }

        records.push(record);
      }

      setPhotos(records);
      setStats({ total: records.length, processed: records.length, success: records.length, failed: 0, cached: records.length });
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
  }, [setShowHistory, setIsProcessing, setCurrentStep, setPhotos, setStats, setInitialInstruction, setActiveInstruction, setShowPreview, addLog, setSuccessMsg, setErrorMsg]);

  // 解析パイプライン開始
  const startAnalysisPipeline = useCallback(async (files: File[], instruction: string, useCache: boolean) => {
    setIsProcessing(true);
    shouldAbortRef.current = false;
    setErrorMsg(null);
    setSuccessMsg(null);

    setInitialInstruction(instruction);
    setActiveInstruction(instruction);
    addLog(`[INSTRUCTION] Initial: "${instruction.substring(0, 50)}${instruction.length > 50 ? '...' : ''}"`, 'info');

    try {
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
          const locationName = extractLocationName(instruction);
          newRecords.push({
            ...tempRecord,
            base64,
            mimeType,
            analysis: { ...cachedAnalysis, station: locationName },
            status: 'done',
            fromCache: true
          });
          cachedCount++;
          addLog(`  ✓ キャッシュから復元`, 'success');
        } else {
          const { base64, mimeType } = await processImageForAI(file);
          newRecords.push({ ...tempRecord, base64, mimeType, status: 'pending', fromCache: false });
          addLog(`  → 新規解析が必要`, 'info');
        }
      }

      addLog(`画像準備完了: ${totalFiles}枚 (キャッシュ: ${cachedCount}枚, 新規: ${totalFiles - cachedCount}枚)`, 'success');

      const initialSorted = sortPhotosLogical(newRecords, currentSortPolicy);
      setPhotos(initialSorted);
      setStats({ total: initialSorted.length, processed: cachedCount, success: cachedCount, failed: 0, cached: cachedCount });
      setShowPreview(true);

      const pendingPhotos = initialSorted.filter(p => p.status === 'pending');

      if (pendingPhotos.length > 0 && apiKey) {
        addLog(`=== STEP 2/4: 写真タイプ判定 ===`, 'info');
        addLog(`${pendingPhotos.length}枚の新規写真をAI解析します`, 'info');

        const result = await processPhotosWithSmartFlow(pendingPhotos, apiKey, instruction, addLog, () => shouldAbortRef.current);

        if (result.type === 'paired') {
          addLog(`=== STEP 3/4: 景観ペアリング ===`, 'info');
          addLog(`${result.pairs?.length || 0}組のペアを作成`, 'success');

          const locationName = extractLocationName(instruction);
          const updatedPhotos: PhotoRecord[] = [];

          result.pairs?.forEach(pair => {
            const beforeAnalysis = pair.before.analysis || { fileName: pair.before.fileName, workType: '', variety: '', detail: '', station: '', remarks: '', description: '', hasBoard: false, detectedText: '' };
            const afterAnalysis = pair.after.analysis || { fileName: pair.after.fileName, workType: '', variety: '', detail: '', station: '', remarks: '', description: '', hasBoard: false, detectedText: '' };

            updatedPhotos.push({
              ...pair.before,
              analysis: { ...beforeAnalysis, sceneId: pair.sceneId, phase: 'before' as const, station: locationName, remarks: '着手前' },
              status: 'done' as const
            });
            updatedPhotos.push({
              ...pair.after,
              analysis: { ...afterAnalysis, sceneId: pair.sceneId, phase: 'after' as const, station: locationName, remarks: '竣工' },
              status: 'done' as const
            });
          });

          setPhotos(prev => {
            const unchanged = prev.filter(p => p.status !== 'pending');
            return [...unchanged, ...updatedPhotos];
          });
          setInitialLayout(2);
        } else {
          addLog(`=== STEP 3/4: 黒板写真解析 ===`, 'info');
          const batchSize = DEFAULT_BATCH_SIZE;
          const batches: PhotoRecord[][] = [];

          for (let i = 0; i < pendingPhotos.length; i += batchSize) {
            batches.push(pendingPhotos.slice(i, i + batchSize));
          }
          addLog(`${pendingPhotos.length}枚を${batches.length}バッチに分割（${PARALLEL_BATCHES}並列）`, 'info');

          for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
            if (shouldAbortRef.current) {
              addLog("解析が中断されました", 'info');
              break;
            }

            const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);
            const processedCount = i * batchSize;
            addLog(`バッチ ${Math.floor(i / PARALLEL_BATCHES) + 1}/${Math.ceil(batches.length / PARALLEL_BATCHES)} 処理中...`, 'info');
            setCurrentStep(`${txt.analyzing} (${processedCount + 1}/${pendingPhotos.length}) - ${parallelBatches.length}並列`);

            const batchPromises = parallelBatches.map(async (batch) => {
              try {
                const results = await analyzePhotoBatch(batch, instruction, batchSize, appMode, apiKey, addLog, logIndividualResult, () => shouldAbortRef.current);
                return batch.map(record => {
                  const res = results.find(r => r.fileName === record.fileName);
                  if (res) {
                    cacheAnalysis(record, res).catch(console.error);
                    return { ...record, analysis: res, status: 'done' as const };
                  }
                  return { ...record, status: 'error' as const };
                });
              } catch (e: any) {
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

      // Normalization check
      addLog(`=== STEP 4/4: データ整合性チェック ===`, 'info');
      let currentPhotos: PhotoRecord[] = [];
      setPhotos(prev => { currentPhotos = prev; return prev; });
      await new Promise(resolve => setTimeout(resolve, 0));

      const newlyAnalyzed = currentPhotos.filter(p => !p.fromCache && p.status === 'done');
      if (newlyAnalyzed.length > 0 && apiKey) {
        addLog(`${newlyAnalyzed.length}枚の解析結果を正規化中...`, 'info');
        setCurrentStep("Finalizing data consistency...");

        const result = await getNormalizationProposals(newlyAnalyzed, apiKey, undefined, addLog, () => shouldAbortRef.current);

        if (result.corrections.length > 0) {
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
          setIsProcessing(false);
          setCurrentStep("");
          return;
        } else {
          addLog('修正提案なし - データは整合しています', 'success');
        }
      }

      setPhotos(prev => {
        const sorted = sortPhotosLogical(prev, currentSortPolicy);
        saveAnalysisHistory(sorted, instruction, getSelectedModel())
          .then(entry => addLog(`履歴保存: ${entry.photoCount}枚 (${new Date(entry.createdAt).toLocaleString('ja-JP')})`, 'success'))
          .catch(e => console.error('履歴保存失敗:', e));
        return sorted;
      });

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
  }, [apiKey, appMode, lang, currentSortPolicy, addLog, logIndividualResult, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setStats, setShowPreview, setInitialLayout, setInitialInstruction, setActiveInstruction, setShowNormalizationModal, setNormalizationProposals, setNormalizationOriginals, setPhotosForNormalization, txt]);

  // 再解析
  const handleRefineAnalysis = useCallback(async (instruction: string, batchSize: number) => {
    setIsProcessing(true);
    setCurrentStep("Refining analysis...");

    if (instruction && instruction !== "__REANALYZE__") {
      setActiveInstruction(instruction);
      addLog(`[INSTRUCTION] Refinement: "${instruction.substring(0, 50)}${instruction.length > 50 ? '...' : ''}"`, 'info');
    }

    try {
      let targetFileNames: string[] = [];
      const refinementStation = extractLocationName(instruction);
      const hasStationOverride = instruction && instruction !== "__REANALYZE__" &&
        (instruction.includes('測点') || instruction.includes('付近') || instruction.includes('地点'));

      const isReanalyzeAllRequest = instruction === "__REANALYZE__" ||
        (instruction && /全体|すべて|全件|全部|all\s*(photos?)?|re-?analyze\s*all/i.test(instruction));

      if (isReanalyzeAllRequest) {
        targetFileNames = photos.map(p => p.fileName);
        addLog("Re-analyzing ALL photos.", 'info');
      } else if (apiKey) {
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
      const batches: PhotoRecord[][] = [];

      for (let i = 0; i < targets.length; i += batchSize) {
        batches.push(targets.slice(i, i + batchSize));
      }

      for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
        const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);
        const processedCount = i * batchSize;
        setCurrentStep(`${txt.analyzing} (${processedCount + 1}/${targets.length}) - ${parallelBatches.length}並列`);

        const batchPromises = parallelBatches.map(async (batch) => {
          if (!apiKey) return batch;
          try {
            const results = await analyzePhotoBatch(batch, instruction === "__REANALYZE__" ? "" : instruction, batchSize, appMode, apiKey, addLog, logIndividualResult, () => shouldAbortRef.current);
            return batch.map(record => {
              const res = results.find(r => r.fileName === record.fileName);
              if (res) {
                let finalAnalysis = res;
                if (record.analysis?.editedFields) {
                  finalAnalysis = { ...res, editedFields: record.analysis.editedFields };
                  record.analysis.editedFields.forEach(field => {
                    (finalAnalysis as any)[field] = (record.analysis as any)[field];
                  });
                }
                if (record.analysis?.sceneId) {
                  finalAnalysis.sceneId = record.analysis.sceneId;
                  finalAnalysis.phase = record.analysis.phase;
                  finalAnalysis.visualAnchors = record.analysis.visualAnchors;
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

      if (hasStationOverride && refinementStation) {
        addLog(`[INSTRUCTION] Applying station "${refinementStation}" to all photos`, 'info');
        updatedTargets = updatedTargets.map(p => p.analysis ? { ...p, analysis: { ...p.analysis, station: refinementStation } } : p);
      }

      setPhotos(prev => prev.map(p => {
        const updated = updatedTargets.find(u => u.fileName === p.fileName);
        if (updated) return updated;
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
      shouldAbortRef.current = false;
      setIsProcessing(false);
      setCurrentStep("");
    }
  }, [apiKey, photos, appMode, addLog, logIndividualResult, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setActiveInstruction, txt]);

  return {
    shouldAbortRef,
    handleAskAI,
    handleAutoPair,
    handleSmartSort,
    handleStartManualPairing,
    handleManualPairingComplete,
    handleLoadHistory,
    startAnalysisPipeline,
    handleRefineAnalysis,
    logIndividualResult,
  };
}
