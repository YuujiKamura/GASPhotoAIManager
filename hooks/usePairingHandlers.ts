import React, { useCallback } from 'react';
import { PhotoRecord, AIAnalysisResult, AppMode, SortPolicy, LogEntry } from '../types';
import { analyzePhotoBatch, identifyTargetPhotos, assignSceneIds } from '../services/geminiService';
import { cacheAnalysis } from '../utils/storage';
import { loadRuleSettings } from '../utils/analysisRules';
import { extractLocationName } from '../utils/locationUtils';
import { sortPhotosLogical, normalizeStationName, arrangePairsStrictly } from '../utils/sortingUtils';
import { AnalysisBackend } from '../services/analysisBackend';

const PARALLEL = 2;

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
  photos: PhotoRecord[];
  appMode: AppMode;
  lang: 'en' | 'ja';
  currentSortPolicy: SortPolicy;
  addLog: (message: string, type?: LogEntry['type'], details?: any) => void;
  logResult: (fn: string, r: AIAnalysisResult) => void;
  setIsProcessing: (v: boolean) => void;
  setCurrentStep: (v: string) => void;
  setErrorMsg: (v: string | null) => void;
  setSuccessMsg: (v: string | null) => void;
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  setActiveInstruction: (v: string) => void;
  abortRef: React.MutableRefObject<boolean>;
  txt: any;
  backend: AnalysisBackend | null;
}

export function usePairingHandlers(p: Props) {
  const { apiKey, photos, appMode, lang, currentSortPolicy, addLog, logResult, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setActiveInstruction, abortRef, txt, backend } = p;

  const handleAutoPair = useCallback(async () => {
    if (backend !== 'gemini') {
      setErrorMsg('自動ペアリングはGeminiモードでのみ利用できます。');
      return;
    }
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
  }, [apiKey, photos, setPhotos, lang, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, abortRef, txt, backend]);

  const handleSmartSort = useCallback(() => { setPhotos(sortPhotosLogical([...photos], currentSortPolicy)); setSuccessMsg(lang === 'ja' ? "測点・シーン順に並び替え" : "Sorted"); }, [photos, setPhotos, currentSortPolicy, lang, setSuccessMsg]);

  const handleRefineAnalysis = useCallback(async (inst: string, bs: number) => {
    if (backend !== 'gemini') {
      setErrorMsg('再解析/絞り込みはGeminiモードでのみ利用できます。');
      return;
    }
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
  }, [apiKey, photos, appMode, addLog, logResult, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setActiveInstruction, abortRef, txt, backend]);

  return { handleAutoPair, handleSmartSort, handleRefineAnalysis };
}
