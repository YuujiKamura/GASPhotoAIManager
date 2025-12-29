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

const BATCH_SIZE = 6, PARALLEL = 2;

const defaultAnalysis = (fn: string): AIAnalysisResult => ({ fileName: fn, workType: '', variety: '', detail: '', station: '', remarks: '', description: '', hasBoard: false, detectedText: '' });
const batches = <T>(arr: T[], n: number) => { const r: T[][] = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };

interface Props {
  apiKey: string | null; photos: PhotoRecord[]; setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  stats: any; setStats: React.Dispatch<React.SetStateAction<any>>; appMode: AppMode; lang: 'en' | 'ja';
  currentSortPolicy: SortPolicy; addLog: (msg: string, type?: LogEntry['type'], details?: any) => void;
  setIsProcessing: (v: boolean) => void; setCurrentStep: (v: string) => void; setErrorMsg: (v: string | null) => void;
  setSuccessMsg: (v: string | null) => void; setShowPreview: (v: boolean) => void; setInitialLayout: (v: 2 | 3) => void;
  setShowNormalizationModal: (v: boolean) => void; setNormalizationProposals: (v: NormalizationCorrection[]) => void;
  setNormalizationOriginals: (v: OriginalData[]) => void; setPhotosForNormalization: (v: PhotoRecord[]) => void;
  setManualPairingPhotos: (v: PhotoRecord[]) => void; setShowManualPairing: (v: boolean) => void;
  setShowHistory: (v: boolean) => void; setIsAskingAI: (v: boolean) => void; initialInstruction: string;
  setInitialInstruction: (v: string) => void; activeInstruction: string; setActiveInstruction: (v: string) => void; txt: any;
}

export function useAnalysisHandlers(p: Props) {
  const { apiKey, photos, setPhotos, setStats, appMode, lang, currentSortPolicy, addLog, setIsProcessing, setCurrentStep,
    setErrorMsg, setSuccessMsg, setShowPreview, setInitialLayout, setShowNormalizationModal, setNormalizationProposals,
    setNormalizationOriginals, setPhotosForNormalization, setManualPairingPhotos, setShowManualPairing, setShowHistory,
    setIsAskingAI, initialInstruction, setInitialInstruction, activeInstruction, setActiveInstruction, txt } = p;
  const abortRef = useRef(false);

  const logResult = useCallback((fn: string, r: AIAnalysisResult) => {
    addLog([`📸 ${fn}`, r.workType && `工種: ${r.workType}`, r.variety && `種別: ${r.variety}`, r.detail && `細別: ${r.detail}`,
      r.station && `測点: ${r.station}`, r.remarks && `備考: ${r.remarks}`].filter(Boolean).join(' | '), 'success', r);
  }, [addLog]);

  const runBatches = useCallback(async (targets: PhotoRecord[], instr: string, size: number, onUp: (u: PhotoRecord[]) => void) => {
    const bs = batches(targets, size); let all: PhotoRecord[] = [];
    for (let i = 0; i < bs.length; i += PARALLEL) {
      if (abortRef.current) { addLog("中断", 'info'); break; }
      const pb = bs.slice(i, i + PARALLEL);
      setCurrentStep(`${txt.analyzing} (${i * size + 1}/${targets.length})`);
      const res = await Promise.all(pb.map(async b => {
        if (!apiKey) return b;
        try {
          const ar = await analyzePhotoBatch(b, instr, size, appMode, apiKey, addLog, logResult, () => abortRef.current);
          return b.map(rec => { const r = ar.find(x => x.fileName === rec.fileName); if (r) { cacheAnalysis(rec, r); return { ...rec, analysis: r, status: 'done' as const }; } return { ...rec, status: 'error' as const }; });
        } catch (e: any) { addLog(`Batch error: ${e.message}`, 'error'); return b.map(r => ({ ...r, status: 'error' as const })); }
      }));
      const upd = res.flat(); all = [...all, ...upd]; onUp(upd);
    }
    return all;
  }, [apiKey, appMode, addLog, logResult, setCurrentStep, txt]);

  const handleAskAI = useCallback(async (prompt: string) => {
    setIsAskingAI(true);
    try { addLog(`[AI] ${prompt.substring(0, 50)}...`, 'info'); const r = await runAIAgent(prompt, l => addLog(l, 'info')); addLog('[AI] 完了', 'success'); return r; }
    catch (e: any) { addLog(`[AI] Error: ${e.message}`, 'error'); throw e; } finally { setIsAskingAI(false); }
  }, [addLog, setIsAskingAI]);

  const handleAutoPair = useCallback(async () => {
    if (!apiKey) { alert(txt.permissionError); return; }
    setIsProcessing(true); setCurrentStep(txt.pairingProcessing);
    try {
      const recs = [...photos], paired = recs.filter(r => r.analysis?.sceneId?.startsWith("AI_S"));
      const withSt = recs.filter(r => !r.analysis?.sceneId?.startsWith("AI_S") && normalizeStationName(r.analysis?.station) !== "UNKNOWN");
      const needAI = recs.filter(r => !r.analysis?.sceneId?.startsWith("AI_S") && normalizeStationName(r.analysis?.station) === "UNKNOWN");
      const upSt = withSt.map(r => { const st = normalizeStationName(r.analysis?.station), rm = r.analysis?.remarks || "";
        return { ...r, analysis: { ...r.analysis!, sceneId: `LOGICAL_${st}`, phase: (rm.includes("着手前") ? 'before' : rm.includes("完了") || rm.includes("竣工") ? 'after' : 'status') as any }};
      });
      let upVis = [...paired];
      if (needAI.length > 1) {
        try { const as = await assignSceneIds(needAI, apiKey, addLog, () => abortRef.current), m = new Map(as.map(a => [a.fileName, a]));
          upVis = [...upVis, ...needAI.map(r => { const a = m.get(r.fileName); return a ? { ...r, analysis: { ...r.analysis!, sceneId: `AI_${a.sceneId}`, phase: a.phase, visualAnchors: a.visualAnchors }} : r; })];
        } catch { upVis = [...upVis, ...needAI]; }
      } else upVis = [...upVis, ...needAI];
      [...upSt, ...upVis].forEach(r => r.analysis && cacheAnalysis(r, r.analysis));
      const { sorted, pairCount, omittedCount } = arrangePairsStrictly([...upSt, ...upVis]);
      setPhotos(sorted); setSuccessMsg(lang === 'ja' ? `${pairCount}組${omittedCount > 0 ? `（${omittedCount}除外）` : ''}` : `${pairCount} pairs`);
    } catch (e: any) { setErrorMsg(e.message); } finally { setIsProcessing(false); setCurrentStep(""); }
  }, [apiKey, photos, setPhotos, lang, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, txt]);

  const handleSmartSort = useCallback(() => { setPhotos(sortPhotosLogical([...photos], currentSortPolicy)); setSuccessMsg(lang === 'ja' ? "並び替え完了" : "Sorted"); }, [photos, setPhotos, currentSortPolicy, lang, setSuccessMsg]);

  const handleStartManualPairing = useCallback(async (files: File[], instr: string) => {
    setIsProcessing(true); setErrorMsg(null); setInitialInstruction(instr); setActiveInstruction(instr);
    try {
      const recs: PhotoRecord[] = [];
      for (const f of files) { const d = await getPhotoDate(f), { base64, mimeType } = await processImageForAI(f);
        recs.push({ fileName: f.name, base64, mimeType, fileSize: f.size, lastModified: f.lastModified, originalFile: f, status: 'pending', date: d, fromCache: false }); }
      setManualPairingPhotos(recs); setShowManualPairing(true);
    } catch (e: any) { setErrorMsg(e.message); } finally { setIsProcessing(false); }
  }, [setIsProcessing, setErrorMsg, setInitialInstruction, setActiveInstruction, setManualPairingPhotos, setShowManualPairing]);

  const handleManualPairingComplete = useCallback((pairs: Array<{ before: PhotoRecord, after: PhotoRecord, id: string }>) => {
    const loc = extractLocationName(activeInstruction || initialInstruction);
    const ph = pairs.flatMap((pr, i) => { const sid = `MANUAL_S${i + 1}`; return [
      { ...pr.before, analysis: { ...(pr.before.analysis || defaultAnalysis(pr.before.fileName)), sceneId: sid, phase: 'before' as const, station: loc, remarks: '着手前' }, status: 'done' as const },
      { ...pr.after, analysis: { ...(pr.after.analysis || defaultAnalysis(pr.after.fileName)), sceneId: sid, phase: 'after' as const, station: loc, remarks: '竣工' }, status: 'done' as const }]; });
    setPhotos(ph); setStats({ total: ph.length, processed: ph.length, success: ph.length, failed: 0, cached: 0 });
    setInitialLayout(2); setShowPreview(true); setShowManualPairing(false); setSuccessMsg(`${pairs.length}組`); addLog(`手動: ${pairs.length}組`, 'success');
  }, [activeInstruction, initialInstruction, setPhotos, setStats, setInitialLayout, setShowPreview, setShowManualPairing, setSuccessMsg, addLog]);

  const handleLoadHistory = useCallback(async (e: AnalysisHistoryEntry) => {
    setShowHistory(false); setIsProcessing(true); setCurrentStep('復元中...');
    try {
      const recs = await Promise.all(e.photoKeys.map(async (k, i) => { const pts = k.split('_'), fn = pts.slice(0, -2).join('_');
        const rec: PhotoRecord = { fileName: fn, base64: e.thumbnails?.[i] || '', mimeType: 'image/jpeg', fileSize: parseInt(pts[pts.length - 2]) || 0, lastModified: parseInt(pts[pts.length - 1]) || 0, status: 'done', date: parseInt(pts[pts.length - 1]) || 0, fromCache: true };
        const c = await getCachedAnalysis(rec); if (c) rec.analysis = c; return rec; }));
      setPhotos(recs); setStats({ total: recs.length, processed: recs.length, success: recs.length, failed: 0, cached: recs.length });
      setInitialInstruction(e.instruction); setActiveInstruction(e.instruction); setShowPreview(true); setSuccessMsg(`${e.photoCount}枚`);
    } catch { setErrorMsg('履歴読み込み失敗'); } finally { setIsProcessing(false); setCurrentStep(''); }
  }, [setShowHistory, setIsProcessing, setCurrentStep, setPhotos, setStats, setInitialInstruction, setActiveInstruction, setShowPreview, setSuccessMsg, setErrorMsg]);

  const startAnalysisPipeline = useCallback(async (files: File[], instr: string, useCache: boolean) => {
    setIsProcessing(true); abortRef.current = false; setErrorMsg(null); setSuccessMsg(null); setInitialInstruction(instr); setActiveInstruction(instr);
    try {
      setCurrentStep(lang === 'ja' ? "準備中..." : "Preparing...");
      const recs: PhotoRecord[] = []; let cached = 0;
      for (const f of files) { const d = await getPhotoDate(f), { base64, mimeType } = await processImageForAI(f), c = useCache ? await getCachedAnalysis(f) : null, loc = extractLocationName(instr);
        if (c) { recs.push({ fileName: f.name, base64, mimeType, fileSize: f.size, lastModified: f.lastModified, originalFile: f, status: 'done', date: d, fromCache: true, analysis: { ...c, station: loc }}); cached++; }
        else recs.push({ fileName: f.name, base64, mimeType, fileSize: f.size, lastModified: f.lastModified, originalFile: f, status: 'pending', date: d, fromCache: false }); }
      const sorted = sortPhotosLogical(recs, currentSortPolicy); setPhotos(sorted);
      setStats({ total: sorted.length, processed: cached, success: cached, failed: 0, cached }); setShowPreview(true);

      const pending = sorted.filter(x => x.status === 'pending');
      if (pending.length > 0 && apiKey) {
        const res = await processPhotosWithSmartFlow(pending, apiKey, instr, addLog, () => abortRef.current);
        if (res.type === 'paired') { const loc = extractLocationName(instr);
          const up = res.pairs?.flatMap(pr => [
            { ...pr.before, analysis: { ...(pr.before.analysis || defaultAnalysis(pr.before.fileName)), sceneId: pr.sceneId, phase: 'before' as const, station: loc, remarks: '着手前' }, status: 'done' as const },
            { ...pr.after, analysis: { ...(pr.after.analysis || defaultAnalysis(pr.after.fileName)), sceneId: pr.sceneId, phase: 'after' as const, station: loc, remarks: '竣工' }, status: 'done' as const }]) || [];
          setPhotos(pv => [...pv.filter(x => x.status !== 'pending'), ...up]); setInitialLayout(2);
        } else await runBatches(pending, instr, BATCH_SIZE, u => setPhotos(pv => pv.map(x => u.find(y => y.fileName === x.fileName) || x)));
      }

      let cur: PhotoRecord[] = []; setPhotos(pv => { cur = pv; return pv; }); await new Promise(r => setTimeout(r, 0));
      const newAn = cur.filter(x => !x.fromCache && x.status === 'done');
      if (newAn.length > 0 && apiKey) { setCurrentStep("Finalizing...");
        const nr = await getNormalizationProposals(newAn, apiKey, undefined, addLog, () => abortRef.current);
        if (nr.corrections.length > 0) { setNormalizationProposals(nr.corrections);
          setNormalizationOriginals(newAn.map(x => ({ fileName: x.fileName, workType: x.analysis?.workType || '', variety: x.analysis?.variety || '', detail: x.analysis?.detail || '', station: x.analysis?.station || '', remarks: x.analysis?.remarks || '' })));
          setPhotosForNormalization(newAn); setShowNormalizationModal(true); setIsProcessing(false); setCurrentStep(""); return; }
      }
      setPhotos(pv => { const s = sortPhotosLogical(pv, currentSortPolicy); saveAnalysisHistory(s, instr, getSelectedModel()); return s; });
      const al = loadAliasSettings(); if (al.enabled && hasAliases(al)) setPhotos(pv => applyAliasesToRecords(pv, al).records);
      setSuccessMsg(txt.done);
    } catch (e: any) { setErrorMsg(e.message); } finally { setIsProcessing(false); setCurrentStep(""); }
  }, [apiKey, appMode, lang, currentSortPolicy, addLog, runBatches, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setStats, setShowPreview, setInitialLayout, setInitialInstruction, setActiveInstruction, setShowNormalizationModal, setNormalizationProposals, setNormalizationOriginals, setPhotosForNormalization, txt]);

  const handleRefineAnalysis = useCallback(async (instr: string, size: number) => {
    setIsProcessing(true); setCurrentStep("Refining..."); if (instr && instr !== "__REANALYZE__") setActiveInstruction(instr);
    try {
      const st = extractLocationName(instr), hasSt = instr && instr !== "__REANALYZE__" && /測点|付近|地点/.test(instr);
      const isAll = instr === "__REANALYZE__" || /全体|すべて|全件|全部|all\s*(photos?)?|re-?analyze\s*all/i.test(instr);
      let fns = isAll ? photos.map(x => x.fileName) : apiKey ? await identifyTargetPhotos(photos, instr, apiKey, addLog, () => abortRef.current) : [];
      if (!fns.length) { setSuccessMsg("No match"); setIsProcessing(false); return; }
      const tgt = photos.filter(x => fns.includes(x.fileName));
      let upd = await runBatches(tgt, instr === "__REANALYZE__" ? "" : instr, size, () => {});
      upd = upd.map(u => { const o = photos.find(x => x.fileName === u.fileName);
        if (o?.analysis?.editedFields && u.analysis) { o.analysis.editedFields.forEach(f => (u.analysis as any)[f] = (o.analysis as any)[f]); u.analysis.editedFields = o.analysis.editedFields; }
        if (o?.analysis?.sceneId && u.analysis) { u.analysis.sceneId = o.analysis.sceneId; u.analysis.phase = o.analysis.phase; u.analysis.visualAnchors = o.analysis.visualAnchors; } return u; });
      if (hasSt && st) upd = upd.map(x => x.analysis ? { ...x, analysis: { ...x.analysis, station: st }} : x);
      setPhotos(pv => pv.map(x => { const u = upd.find(y => y.fileName === x.fileName); if (u) return u; if (hasSt && st && x.analysis) return { ...x, analysis: { ...x.analysis, station: st }}; return x; }));
      setSuccessMsg(`Updated ${upd.length}`);
    } catch (e: any) { setErrorMsg(e.message); } finally { abortRef.current = false; setIsProcessing(false); setCurrentStep(""); }
  }, [apiKey, photos, runBatches, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setActiveInstruction]);

  return { shouldAbortRef: abortRef, handleAskAI, handleAutoPair, handleSmartSort, handleStartManualPairing, handleManualPairingComplete, handleLoadHistory, startAnalysisPipeline, handleRefineAnalysis, logIndividualResult: logResult };
}
