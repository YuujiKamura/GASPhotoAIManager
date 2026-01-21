import React, { useCallback, useRef } from 'react';
import { PhotoRecord, AIAnalysisResult, AppMode, SortPolicy, LogEntry } from '../types';
import { processImageForAI, getPhotoDate } from '../utils/imageUtils';
import { analyzePhotoBatch, getNormalizationProposals, getSelectedModel, NormalizationCorrection } from '../services/geminiService';
import { processPhotosWithSmartFlow } from '../services/smartFlowService';
import { getCachedAnalysis, cacheAnalysis, saveAnalysisHistory } from '../utils/storage';
import { loadRuleSettings } from '../utils/analysisRules';
import { loadAliasSettings, hasAliases, applyAliasesToRecords } from '../utils/workTypeAliases';
import { extractLocationName } from '../utils/locationUtils';
import { sortPhotosLogical } from '../utils/sortingUtils';
import { OriginalData } from '../components/NormalizationPreviewModal';
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
}

export function useAnalysisPipeline(p: Props) {
  const { apiKey, appMode, lang, currentSortPolicy, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setStats, setShowPreview, setInitialLayout, setShowNormalizationModal, setNormalizationProposals, setNormalizationOriginals, setPhotosForNormalization, setInitialInstruction, setActiveInstruction, txt } = p;
  const abortRef = useRef(false);

  const logResult = useCallback((fn: string, r: AIAnalysisResult) => {
    addLog([`📸 ${fn}`, r.workType && `工種: ${r.workType}`, r.variety && `種別: ${r.variety}`, r.detail && `細別: ${r.detail}`, r.station && `測点: ${r.station}`, r.remarks && `備考: ${r.remarks}`].filter(Boolean).join(' | '), 'success', r);
  }, [addLog]);

  const startAnalysisPipeline = useCallback(async (files: File[], inst: string, useCache: boolean, preInfo?: PreAnalysisInfo) => {
    setIsProcessing(true); abortRef.current = false; setErrorMsg(null); setSuccessMsg(null); setInitialInstruction(inst); setActiveInstruction(inst);
    // preInfoから測点情報を抽出（指定があればそちらを優先）
    const stationFromPreInfo = preInfo?.station || extractLocationName(inst);
    const workTypeFromPreInfo = preInfo?.workType;
    if (workTypeFromPreInfo) addLog(`📋 事前入力: 工種=${workTypeFromPreInfo}${stationFromPreInfo ? `, 測点=${stationFromPreInfo}` : ''}`, 'info');
    try {
      setCurrentStep(lang === 'ja' ? "画像準備中..." : "Preparing...");
      const recs: PhotoRecord[] = []; let cached = 0;
      for (const f of files) {
        const [date, { base64, mimeType }] = await Promise.all([getPhotoDate(f), processImageForAI(f)]);
        const ca = useCache ? await getCachedAnalysis(f) : null;
        if (ca) { recs.push({ fileName: f.name, base64, mimeType, fileSize: f.size, lastModified: f.lastModified, originalFile: f, analysis: { ...ca, station: stationFromPreInfo || ca.station }, status: 'done', date, fromCache: true }); cached++; }
        else recs.push({ fileName: f.name, base64, mimeType, fileSize: f.size, lastModified: f.lastModified, originalFile: f, status: 'pending', date, fromCache: false });
      }
      const sorted = sortPhotosLogical(recs, currentSortPolicy);
      setPhotos(sorted); setStats({ total: sorted.length, processed: cached, success: cached, failed: 0, cached }); setShowPreview(true);

      const pending = sorted.filter(x => x.status === 'pending');
      if (pending.length > 0) {
        // ローカルAPIサーバーが起動しているかチェック
        const localServerAvailable = await checkServerHealth();

        if (localServerAvailable) {
          // ローカルAPI経由で解析（Claude Code CLI使用）
          addLog('🖥️ ローカルAPIサーバー経由で解析開始', 'info');
          setCurrentStep(lang === 'ja' ? "Claude Code解析中..." : "Analyzing with Claude Code...");
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
              addLog(`✅ ${analyzed.filter(a => a.status === 'done').length}枚の解析完了`, 'success');
            } else {
              throw new Error(response.error || 'Local API error');
            }
          } catch (e: any) {
            addLog(`❌ ローカルAPI解析エラー: ${e.message}`, 'error');
            setPhotos(prev => prev.map(x => pending.find(y => y.fileName === x.fileName) ? { ...x, status: 'error' as const } : x));
          }
        } else if (apiKey) {
          // 従来のGemini API経由で解析
          const res = await processPhotosWithSmartFlow(pending, apiKey, inst, addLog, () => abortRef.current, workTypeFromPreInfo);
          if (res.type === 'paired') {
            const up = res.pairs?.flatMap(pr => [
              { ...pr.before, analysis: { ...(pr.before.analysis || emptyAnalysis(pr.before.fileName)), sceneId: pr.sceneId, phase: 'before' as const, workType: workTypeFromPreInfo || pr.before.analysis?.workType || '', station: stationFromPreInfo, remarks: '着手前' }, status: 'done' as const },
              { ...pr.after, analysis: { ...(pr.after.analysis || emptyAnalysis(pr.after.fileName)), sceneId: pr.sceneId, phase: 'after' as const, workType: workTypeFromPreInfo || pr.after.analysis?.workType || '', station: stationFromPreInfo, remarks: '竣工' }, status: 'done' as const }
            ]) || [];
            setPhotos(prev => [...prev.filter(x => x.status !== 'pending'), ...up]); setInitialLayout(2);
          } else {
            const an = await runBatches(pending, BATCH_SIZE, PARALLEL, async b => {
              try { const rs = await analyzePhotoBatch(b, inst, BATCH_SIZE, appMode, apiKey, addLog, logResult, () => abortRef.current, undefined, loadRuleSettings(), workTypeFromPreInfo); return b.map(r => { const x = rs.find(y => y.fileName === r.fileName); if (x) { cacheAnalysis(r, x).catch(() => {}); return { ...r, analysis: x, status: 'done' as const }; } return { ...r, status: 'error' as const }; }); }
              catch { return b.map(r => ({ ...r, status: 'error' as const })); }
            }, (n, t) => setCurrentStep(`${txt.analyzing} (${n + 1}/${t})`), () => abortRef.current);
            setPhotos(prev => prev.map(x => an.find(y => y.fileName === x.fileName) || x));
          }
        } else {
          // APIキーもローカルサーバーもない
          addLog('⚠️ 解析するにはローカルAPIサーバーを起動するか、Gemini APIキーを設定してください', 'warning');
        }
      }

      let cur: PhotoRecord[] = []; setPhotos(prev => { cur = prev; return prev; }); await new Promise(r => setTimeout(r, 0));
      const newly = cur.filter(x => !x.fromCache && x.status === 'done');
      if (newly.length > 0 && apiKey) {
        const nr = await getNormalizationProposals(newly, apiKey, undefined, addLog, () => abortRef.current);
        if (nr.corrections.length > 0) {
          setNormalizationProposals(nr.corrections);
          setNormalizationOriginals(newly.map(x => ({ fileName: x.fileName, workType: x.analysis?.workType || '', variety: x.analysis?.variety || '', detail: x.analysis?.detail || '', station: x.analysis?.station || '', remarks: x.analysis?.remarks || '' })));
          setPhotosForNormalization(newly); setShowNormalizationModal(true); setIsProcessing(false); setCurrentStep(""); return;
        }
      }
      setPhotos(prev => { const s = sortPhotosLogical(prev, currentSortPolicy); saveAnalysisHistory(s, inst, getSelectedModel()).catch(() => {}); return s; });
      const al = loadAliasSettings(); if (al.enabled && hasAliases(al)) setPhotos(prev => applyAliasesToRecords(prev, al).records);
      setSuccessMsg(txt.done);
    } catch (e: any) { setErrorMsg(e.message || "Error"); } finally { setIsProcessing(false); setCurrentStep(""); }
  }, [apiKey, appMode, lang, currentSortPolicy, addLog, logResult, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setStats, setShowPreview, setInitialLayout, setInitialInstruction, setActiveInstruction, setShowNormalizationModal, setNormalizationProposals, setNormalizationOriginals, setPhotosForNormalization, txt]);

  return { abortRef, startAnalysisPipeline, logResult };
}
