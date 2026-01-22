import React, { useCallback, useRef } from 'react';
import { PhotoRecord, ProcessedFile, AIAnalysisResult, AppMode, SortPolicy, LogEntry, AnalysisStep, AnalysisStepId, PostProcessType } from '../types';
import { analyzePhotoBatch, getNormalizationProposals, getSelectedModel, NormalizationCorrection } from '../services/geminiService';
import { AnalysisBackend } from '../services/analysisBackend';
import { getCachedAnalysis, cacheAnalysis, saveAnalysisHistory } from '../utils/storage';
import { loadRuleSettings } from '../utils/analysisRules';
import { extractLocationName } from '../utils/locationUtils';
import { sortPhotosLogical } from '../utils/sortingUtils';
import { OriginalData } from '../components/NormalizationPreviewModal';
import { loadMasterCsv } from '../utils/masterCsvParser';
import { checkServerHealth, analyzePhotos as localAnalyzePhotos } from '../services/localApiService';
import { PreAnalysisInfo } from '../components/AnalysisSetupModal';

const BATCH_SIZE = 6, PARALLEL = 2;

const emptyAnalysis = (fn: string): AIAnalysisResult => ({ fileName: fn, workType: '', variety: '', detail: '', station: '', remarks: '', description: '', hasBoard: false, detectedText: '' });

async function runBatches<T extends PhotoRecord>(items: T[], size: number, parallel: number, proc: (b: T[]) => Promise<T[]>, progress?: (n: number, t: number) => void, abort?: () => boolean): Promise<T[]> {
  const batches: T[][] = []; for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  const results: T[] = [];
  for (let i = 0; i < batches.length; i += parallel) {
    if (abort?.()) break;
    progress?.(i * size, items.length);
    results.push(...(await Promise.all(batches.slice(i, i + parallel).map(proc))).flat());
  }
  return results;
}

interface Props {
  apiKey: string | null;
  appMode: AppMode;
  lang: 'en' | 'ja';
  currentSortPolicy: SortPolicy;
  addLog: (message: string, type?: LogEntry['type'], details?: any) => void;
  setIsProcessing: (v: boolean) => void;
  setCurrentStep: (v: string) => void;
  setErrorMsg: (v: string | null) => void;
  setSuccessMsg: (v: string | null) => void;
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  setStats: React.Dispatch<React.SetStateAction<any>>;
  setShowPreview: (v: boolean) => void;
  setInitialLayout: (v: 2 | 3) => void;
  setShowNormalizationModal: (v: boolean) => void;
  setNormalizationProposals: (v: NormalizationCorrection[]) => void;
  setNormalizationOriginals: (v: OriginalData[]) => void;
  setPhotosForNormalization: (v: PhotoRecord[]) => void;
  setInitialInstruction: (v: string) => void;
  setActiveInstruction: (v: string) => void;
  txt: any;
  onStepUpdate?: (id: AnalysisStepId, update: Partial<AnalysisStep>) => void;
  backend: AnalysisBackend | null;
}

export function useAnalysisPipeline(p: Props) {
  const { apiKey, appMode, lang, currentSortPolicy, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setStats, setShowPreview, setInitialLayout, setShowNormalizationModal, setNormalizationProposals, setNormalizationOriginals, setPhotosForNormalization, setInitialInstruction, setActiveInstruction, txt, onStepUpdate, backend } = p;
  const abortRef = useRef(false);

  const logResult = useCallback((fn: string, r: AIAnalysisResult) => {
    addLog([`📸 ${fn}`, r.workType && `工種: ${r.workType}`, r.variety && `種別: ${r.variety}`, r.detail && `細別: ${r.detail}`, r.station && `測点: ${r.station}`, r.remarks && `備考: ${r.remarks}`].filter(Boolean).join(' | '), 'success', r);
  }, [addLog]);

  const startAnalysisPipeline = useCallback(async (files: ProcessedFile[], inst: string, useCache: boolean, preInfo?: PreAnalysisInfo) => {
    setIsProcessing(true); abortRef.current = false; setErrorMsg(null); setSuccessMsg(null); setInitialInstruction(inst); setActiveInstruction(inst);
    // preInfoから測点情報を抽出（指定があればそちらを優先）
    const stationFromPreInfo = preInfo?.station || extractLocationName(inst);
    const workTypeFromPreInfo = preInfo?.workType;
    if (workTypeFromPreInfo) addLog(`📋 事前入力: 工種=${workTypeFromPreInfo}${stationFromPreInfo ? `, 測点=${stationFromPreInfo}` : ''}`, 'info');
    try {
      // マスタCSVをプリロード（バリデーション用キャッシュを確保）
      const masterRows = await loadMasterCsv();
      addLog(`📂 マスタロード: ${masterRows.length}件`, 'info');

      setCurrentStep(lang === 'ja' ? "画像準備中..." : "Preparing...");
      onStepUpdate?.('prepare', { status: 'running' });
      const recs: PhotoRecord[] = []; let cached = 0;
      // ProcessedFile にはすでに base64, mimeType, date が含まれている
      for (const f of files) {
        const ca = useCache ? await getCachedAnalysis(f) : null;
        if (ca) { recs.push({ fileName: f.fileName, base64: f.base64, mimeType: f.mimeType, fileSize: f.fileSize, lastModified: f.lastModified, analysis: { ...ca, station: stationFromPreInfo || ca.station }, status: 'done', date: f.date, fromCache: true }); cached++; }
        else recs.push({ fileName: f.fileName, base64: f.base64, mimeType: f.mimeType, fileSize: f.fileSize, lastModified: f.lastModified, status: 'pending', date: f.date, fromCache: false });
      }
      const sorted = sortPhotosLogical(recs, currentSortPolicy);
      setPhotos(sorted); setStats({ total: sorted.length, processed: cached, success: cached, failed: 0, cached }); setShowPreview(true);
      onStepUpdate?.('prepare', { status: 'done', result: `${sorted.length}枚読込` });

      const pending = sorted.filter(x => x.status === 'pending');
      if (pending.length > 0) {
        onStepUpdate?.('detect', { status: 'running' });

        if (backend === 'local') {
          const localServerAvailable = await checkServerHealth();
          if (!localServerAvailable) {
            onStepUpdate?.('detect', { status: 'error', result: 'ローカルAPI未接続' });
            addLog('⚠️ ローカルAPIサーバーが起動していません', 'warning');
            onStepUpdate?.('analyze', { status: 'skipped' });
          } else {
            onStepUpdate?.('detect', { status: 'done', result: 'ローカルAPI' });
            addLog('🖥️ ローカルAPIサーバー経由で解析開始', 'info');
            setCurrentStep(lang === 'ja' ? "Claude Code解析中..." : "Analyzing with Claude Code...");
            onStepUpdate?.('analyze', { status: 'running', subProgress: `(0/${pending.length})` });
            try {
              const photos = pending.map(p => ({
                fileName: p.fileName,
                base64: p.base64,
                mimeType: p.mimeType,
                date: p.date,
              }));
              const response = await localAnalyzePhotos(photos, { mode: appMode, instruction: inst, workType: workTypeFromPreInfo });
              if (response.success && response.results) {
                const analyzed = pending.map(p => {
                  const result = response.results?.find(r => r.fileName === p.fileName);
                  if (result?.analysis) {
                    const analysis: AIAnalysisResult = {
                      ...result.analysis,
                      workType: workTypeFromPreInfo || result.analysis.workType,
                      station: stationFromPreInfo || result.analysis.station,
                    };
                    logResult(p.fileName, analysis);
                    cacheAnalysis(p, analysis).catch(() => {});
                    return { ...p, analysis, status: 'done' as const };
                  }
                  return { ...p, status: 'error' as const };
                });
                setPhotos(prev => prev.map(x => analyzed.find(y => y.fileName === x.fileName) || x));
                const doneCount = analyzed.filter(a => a.status === 'done').length;
                addLog(`✅ ${doneCount}枚の解析完了`, 'success');
                onStepUpdate?.('analyze', { status: 'done', result: `${doneCount}枚完了` });
              } else {
                throw new Error(response.error || 'Local API error');
              }
            } catch (e: any) {
              addLog(`❌ ローカルAPI解析エラー: ${e.message}`, 'error');
              onStepUpdate?.('analyze', { status: 'error', result: e.message });
              setPhotos(prev => prev.map(x => pending.find(y => y.fileName === x.fileName) ? { ...x, status: 'error' as const } : x));
            }
          }
        } else if (backend === 'gemini') {
          if (!apiKey) {
            onStepUpdate?.('detect', { status: 'skipped' });
            onStepUpdate?.('analyze', { status: 'skipped' });
            addLog('⚠️ Gemini APIキーが未設定です', 'warning');
          } else {
            onStepUpdate?.('detect', { status: 'done', result: 'Gemini API' });
            onStepUpdate?.('analyze', { status: 'running', subProgress: `(0/${pending.length})` });
            const an = await runBatches(pending, BATCH_SIZE, PARALLEL, async b => {
              try { const rs = await analyzePhotoBatch(b, inst, BATCH_SIZE, appMode, apiKey, addLog, logResult, () => abortRef.current, undefined, loadRuleSettings(), workTypeFromPreInfo); return b.map(r => { const x = rs.find(y => y.fileName === r.fileName); if (x) { cacheAnalysis(r, x).catch(() => {}); return { ...r, analysis: x, status: 'done' as const }; } return { ...r, status: 'error' as const }; }); }
              catch { return b.map(r => ({ ...r, status: 'error' as const })); }
            }, (n, t) => { setCurrentStep(`${txt.analyzing} (${n + 1}/${t})`); onStepUpdate?.('analyze', { progress: Math.round((n / t) * 100), subProgress: `(${n + 1}/${t})` }); }, () => abortRef.current);
            setPhotos(prev => prev.map(x => an.find(y => y.fileName === x.fileName) || x));
            const doneCount = an.filter(a => a.status === 'done').length;
            onStepUpdate?.('analyze', { status: 'done', result: `${doneCount}枚完了` });
          }
        } else {
          onStepUpdate?.('detect', { status: 'skipped' });
          onStepUpdate?.('analyze', { status: 'skipped' });
          addLog('⚠️ 解析バックエンドが未選択です', 'warning');
        }
      }

      let cur: PhotoRecord[] = []; setPhotos(prev => { cur = prev; return prev; }); await new Promise(r => setTimeout(r, 0));
      const newly = cur.filter(x => !x.fromCache && x.status === 'done');
      const postProcessType: PostProcessType = preInfo?.postProcessType || 'relay_only';

      // 後処理（タイプに応じた処理）
      if (postProcessType !== 'none' && newly.length > 0 && apiKey && backend === 'gemini') {
        onStepUpdate?.('normalize', { status: 'running' });
        // TODO: postProcessTypeに応じたサジェスト生成を実装
        // 現時点では従来の正規化処理をrelay_only以外で実行
        if (postProcessType === 'temperature_cycle' || postProcessType === 'dekigata') {
          const nr = await getNormalizationProposals(newly, apiKey, undefined, addLog, () => abortRef.current);
          if (nr.corrections.length > 0) {
            onStepUpdate?.('normalize', { status: 'done', result: `${nr.corrections.length}件提案` });
            setNormalizationProposals(nr.corrections);
            setNormalizationOriginals(newly.map(x => ({ fileName: x.fileName, workType: x.analysis?.workType || '', variety: x.analysis?.variety || '', detail: x.analysis?.detail || '', station: x.analysis?.station || '', remarks: x.analysis?.remarks || '' })));
            setPhotosForNormalization(newly); setShowNormalizationModal(true); setIsProcessing(false); setCurrentStep(""); return;
          }
          onStepUpdate?.('normalize', { status: 'done', result: '変更なし' });
        } else {
          // relay_only: 前ならえ処理のみ（applyContextRelayで既に適用済み）
          onStepUpdate?.('normalize', { status: 'done', result: '前ならえ適用済み' });
        }
      } else {
        onStepUpdate?.('normalize', { status: 'skipped' });
      }
      setPhotos(prev => { const s = sortPhotosLogical(prev, currentSortPolicy); saveAnalysisHistory(s, inst, getSelectedModel()).catch(() => {}); return s; });
      setSuccessMsg(txt.done);
    } catch (e: any) { setErrorMsg(e.message || "Error"); } finally { setIsProcessing(false); setCurrentStep(""); }
  }, [apiKey, appMode, lang, currentSortPolicy, addLog, logResult, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setStats, setShowPreview, setInitialLayout, setInitialInstruction, setActiveInstruction, setShowNormalizationModal, setNormalizationProposals, setNormalizationOriginals, setPhotosForNormalization, txt, onStepUpdate, backend]);

  return { abortRef, startAnalysisPipeline, logResult };
}
