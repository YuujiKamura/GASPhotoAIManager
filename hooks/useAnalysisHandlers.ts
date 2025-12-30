import React, { useCallback, useRef } from 'react';
import { PhotoRecord, AIAnalysisResult, AppMode, SortPolicy, LogEntry } from '../types';
import { processImageForAI, getPhotoDate } from '../utils/imageUtils';
import { analyzePhotoBatch, identifyTargetPhotos, getNormalizationProposals, assignSceneIds, getSelectedModel, NormalizationCorrection } from '../services/geminiService';
import { processPhotosWithSmartFlow } from '../services/smartFlowService';
import { getCachedAnalysis, cacheAnalysis, saveAnalysisHistory } from '../utils/storage';
import { loadRuleSettings } from '../utils/analysisRules';
import { runAIAgent } from '../services/aiAgentService';
import { loadAliasSettings, hasAliases, applyAliasesToRecords } from '../utils/workTypeAliases';
import { extractLocationName } from '../utils/locationUtils';
import { sortPhotosLogical, normalizeStationName, arrangePairsStrictly } from '../utils/sortingUtils';
import { OriginalData } from '../components/NormalizationPreviewModal';
import { useManualPairingHandlers } from './useManualPairingHandlers';
import { useHistoryHandlers } from './useHistoryHandlers';

const BATCH_SIZE = 6, PARALLEL = 2;

interface Props {
  apiKey: string | null; photos: PhotoRecord[]; setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  stats: any; setStats: React.Dispatch<React.SetStateAction<any>>; appMode: AppMode; lang: 'en' | 'ja';
  currentSortPolicy: SortPolicy; addLog: (message: string, type?: LogEntry['type'], details?: any) => void;
  setIsProcessing: (v: boolean) => void; setCurrentStep: (v: string) => void; setErrorMsg: (v: string | null) => void;
  setSuccessMsg: (v: string | null) => void; setShowPreview: (v: boolean) => void; setInitialLayout: (v: 2 | 3) => void;
  setShowNormalizationModal: (v: boolean) => void; setNormalizationProposals: (v: NormalizationCorrection[]) => void;
  setNormalizationOriginals: (v: OriginalData[]) => void; setPhotosForNormalization: (v: PhotoRecord[]) => void;
  setManualPairingPhotos: (v: PhotoRecord[]) => void; setShowManualPairing: (v: boolean) => void;
  setShowHistory: (v: boolean) => void; setIsAskingAI: (v: boolean) => void; initialInstruction: string;
  setInitialInstruction: (v: string) => void; activeInstruction: string; setActiveInstruction: (v: string) => void; txt: any;
}

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

export function useAnalysisHandlers(p: Props) {
  const { apiKey, photos, setPhotos, setStats, appMode, lang, currentSortPolicy, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setShowPreview, setInitialLayout, setShowNormalizationModal, setNormalizationProposals, setNormalizationOriginals, setPhotosForNormalization, setManualPairingPhotos, setShowManualPairing, setShowHistory, setIsAskingAI, initialInstruction, setInitialInstruction, activeInstruction, setActiveInstruction, txt } = p;
  const abortRef = useRef(false);

  // 分離したフックを使用
  const { handleStartManualPairing, handleManualPairingComplete } = useManualPairingHandlers({
    lang, addLog, setIsProcessing, setErrorMsg, setSuccessMsg, setPhotos, setStats, setInitialLayout, setShowPreview, setManualPairingPhotos, setShowManualPairing, setInitialInstruction, setActiveInstruction, initialInstruction, activeInstruction
  });
  const { handleLoadHistory } = useHistoryHandlers({
    setShowHistory, setIsProcessing, setCurrentStep, setPhotos, setStats, setInitialInstruction, setActiveInstruction, setShowPreview, setSuccessMsg, setErrorMsg
  });

  const logResult = useCallback((fn: string, r: AIAnalysisResult) => {
    addLog([`📸 ${fn}`, r.workType && `工種: ${r.workType}`, r.variety && `種別: ${r.variety}`, r.detail && `細別: ${r.detail}`, r.station && `測点: ${r.station}`, r.remarks && `備考: ${r.remarks}`].filter(Boolean).join(' | '), 'success', r);
  }, [addLog]);

  const handleAskAI = useCallback(async (prompt: string) => {
    setIsAskingAI(true);
    try { addLog(`[AIエージェント] ${prompt.slice(0, 50)}...`, 'info'); const r = await runAIAgent(prompt, l => addLog(l, 'info')); addLog('[AIエージェント] 完了', 'success'); return r; }
    catch (e: any) { addLog(`[AIエージェント] エラー: ${e.message}`, 'error'); throw e; }
    finally { setIsAskingAI(false); }
  }, [addLog, setIsAskingAI]);

  const handleAutoPair = useCallback(async () => {
    if (!apiKey) { alert(txt.permissionError); return; }
    setIsProcessing(true); setCurrentStep(txt.pairingProcessing);
    try {
      const hasStation: PhotoRecord[] = [], needsAI: PhotoRecord[] = [], paired: PhotoRecord[] = [];
      photos.forEach(r => {
        if (r.analysis?.sceneId?.startsWith("AI_S")) { paired.push(r); return; }
        const st = normalizeStationName(r.analysis?.station);
        (st && st !== "UNKNOWN" ? hasStation : needsAI).push(r);
      });
      const updatedStation = hasStation.map(r => {
        const st = normalizeStationName(r.analysis?.station), rm = r.analysis?.remarks || "";
        return { ...r, analysis: { ...r.analysis!, sceneId: `LOGICAL_${st}`, phase: (rm.includes("着手前") ? 'before' : rm.includes("完了") || rm.includes("竣工") ? 'after' : 'status') as any } };
      });
      let visual = [...paired];
      if (needsAI.length > 1) {
        try {
          const a = await assignSceneIds(needsAI, apiKey, addLog, () => abortRef.current);
          const m = new Map(a.map(x => [x.fileName, x]));
          visual.push(...needsAI.map(r => { const x = m.get(r.fileName); return x ? { ...r, analysis: { ...r.analysis!, sceneId: `AI_${x.sceneId}`, phase: x.phase, visualAnchors: x.visualAnchors } } : r; }));
        } catch { visual.push(...needsAI); }
      } else visual.push(...needsAI);
      const all = [...updatedStation, ...visual]; all.forEach(r => r.analysis && cacheAnalysis(r, r.analysis).catch(() => {}));
      const { sorted, pairCount, omittedCount } = arrangePairsStrictly(all);
      setPhotos(sorted);
      setSuccessMsg(lang === 'ja' ? `${pairCount}組の着手前-完了ペア${omittedCount > 0 ? `（${omittedCount}枚除外）` : ''}` : `${pairCount} pairs${omittedCount > 0 ? ` (${omittedCount} omitted)` : ''}`);
    } catch (e: any) { setErrorMsg("Pairing failed: " + e.message); }
    finally { setIsProcessing(false); setCurrentStep(""); }
  }, [apiKey, photos, setPhotos, lang, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, txt]);

  const handleSmartSort = useCallback(() => { setPhotos(sortPhotosLogical([...photos], currentSortPolicy)); setSuccessMsg(lang === 'ja' ? "測点・シーン順に並び替え" : "Sorted"); }, [photos, setPhotos, currentSortPolicy, lang, setSuccessMsg]);

  const startAnalysisPipeline = useCallback(async (files: File[], inst: string, useCache: boolean) => {
    setIsProcessing(true); abortRef.current = false; setErrorMsg(null); setSuccessMsg(null); setInitialInstruction(inst); setActiveInstruction(inst);
    try {
      setCurrentStep(lang === 'ja' ? "画像準備中..." : "Preparing...");
      const recs: PhotoRecord[] = []; let cached = 0;
      for (const f of files) {
        const [date, { base64, mimeType }] = await Promise.all([getPhotoDate(f), processImageForAI(f)]);
        const ca = useCache ? await getCachedAnalysis(f) : null;
        if (ca) { recs.push({ fileName: f.name, base64, mimeType, fileSize: f.size, lastModified: f.lastModified, originalFile: f, analysis: { ...ca, station: extractLocationName(inst) }, status: 'done', date, fromCache: true }); cached++; }
        else recs.push({ fileName: f.name, base64, mimeType, fileSize: f.size, lastModified: f.lastModified, originalFile: f, status: 'pending', date, fromCache: false });
      }
      const sorted = sortPhotosLogical(recs, currentSortPolicy);
      setPhotos(sorted); setStats({ total: sorted.length, processed: cached, success: cached, failed: 0, cached }); setShowPreview(true);

      const pending = sorted.filter(x => x.status === 'pending');
      if (pending.length > 0 && apiKey) {
        const res = await processPhotosWithSmartFlow(pending, apiKey, inst, addLog, () => abortRef.current);
        if (res.type === 'paired') {
          const loc = extractLocationName(inst);
          const up = res.pairs?.flatMap(pr => [
            { ...pr.before, analysis: { ...(pr.before.analysis || emptyAnalysis(pr.before.fileName)), sceneId: pr.sceneId, phase: 'before' as const, station: loc, remarks: '着手前' }, status: 'done' as const },
            { ...pr.after, analysis: { ...(pr.after.analysis || emptyAnalysis(pr.after.fileName)), sceneId: pr.sceneId, phase: 'after' as const, station: loc, remarks: '竣工' }, status: 'done' as const }
          ]) || [];
          setPhotos(prev => [...prev.filter(x => x.status !== 'pending'), ...up]); setInitialLayout(2);
        } else {
          const an = await runBatches(pending, BATCH_SIZE, PARALLEL, async b => {
            try { const rs = await analyzePhotoBatch(b, inst, BATCH_SIZE, appMode, apiKey, addLog, logResult, () => abortRef.current, undefined, loadRuleSettings()); return b.map(r => { const x = rs.find(y => y.fileName === r.fileName); if (x) { cacheAnalysis(r, x).catch(() => {}); return { ...r, analysis: x, status: 'done' as const }; } return { ...r, status: 'error' as const }; }); }
            catch { return b.map(r => ({ ...r, status: 'error' as const })); }
          }, (n, t) => setCurrentStep(`${txt.analyzing} (${n + 1}/${t})`), () => abortRef.current);
          setPhotos(prev => prev.map(x => an.find(y => y.fileName === x.fileName) || x));
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

  const handleRefineAnalysis = useCallback(async (inst: string, bs: number) => {
    setIsProcessing(true); setCurrentStep("Refining..."); if (inst && inst !== "__REANALYZE__") setActiveInstruction(inst);
    try {
      const all = inst === "__REANALYZE__" || /全体|すべて|全件|全部|all\s*(photos?)?|re-?analyze\s*all/i.test(inst);
      const fns = all ? photos.map(x => x.fileName) : (apiKey ? await identifyTargetPhotos(photos, inst, apiKey, addLog, () => abortRef.current) : []);
      if (fns.length === 0) { setSuccessMsg("No match."); setIsProcessing(false); return; }
      const tgt = photos.filter(x => fns.includes(x.fileName)), loc = extractLocationName(inst), hasLoc = inst && inst !== "__REANALYZE__" && /測点|付近|地点/.test(inst);
      const up = await runBatches(tgt, bs, PARALLEL, async b => {
        if (!apiKey) return b;
        try { const rs = await analyzePhotoBatch(b, inst === "__REANALYZE__" ? "" : inst, bs, appMode, apiKey, addLog, logResult, () => abortRef.current, undefined, loadRuleSettings());
          return b.map(r => { const x = rs.find(y => y.fileName === r.fileName); if (x) { let f = x; if (r.analysis?.editedFields) { f = { ...x, editedFields: r.analysis.editedFields }; r.analysis.editedFields.forEach(k => (f as any)[k] = (r.analysis as any)[k]); } if (r.analysis?.sceneId) { f.sceneId = r.analysis.sceneId; f.phase = r.analysis.phase; f.visualAnchors = r.analysis.visualAnchors; } cacheAnalysis(r, f).catch(() => {}); return { ...r, analysis: f, status: 'done' as const }; } return r; }); }
        catch { return b; }
      }, (n, t) => setCurrentStep(`${txt.analyzing} (${n + 1}/${t})`), () => abortRef.current);
      const fin = hasLoc && loc ? up.map(x => x.analysis ? { ...x, analysis: { ...x.analysis, station: loc } } : x) : up;
      setPhotos(prev => prev.map(x => { const u = fin.find(y => y.fileName === x.fileName); if (u) return u; if (hasLoc && loc && x.analysis) return { ...x, analysis: { ...x.analysis, station: loc } }; return x; }));
      setSuccessMsg(`Updated ${fin.length}${hasLoc ? ` (${loc})` : ''}`);
    } catch (e: any) { setErrorMsg("Refine: " + e.message); } finally { abortRef.current = false; setIsProcessing(false); setCurrentStep(""); }
  }, [apiKey, photos, appMode, addLog, logResult, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setActiveInstruction, txt]);

  return { shouldAbortRef: abortRef, handleAskAI, handleAutoPair, handleSmartSort, handleStartManualPairing, handleManualPairingComplete, handleLoadHistory, startAnalysisPipeline, handleRefineAnalysis, logIndividualResult: logResult };
}
