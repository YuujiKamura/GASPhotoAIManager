import React, { useState, useMemo, useEffect } from 'react';
import { X, Replace, Search, ArrowRight, CheckCircle2, AlertTriangle, Edit3, History } from 'lucide-react';
import { PhotoRecord } from '../types';
import { getStationHistory, addStationToHistory } from '../utils/storage';

const EMPTY_STATION_LABEL = '(空白)';

interface StationReplaceModalProps {
  photos: PhotoRecord[];
  lang: 'en' | 'ja';
  onClose: () => void;
  onReplace: (replacements: Array<{ fileName: string; newStation: string }>) => void;
}

// 共通のリストアイテムコンポーネント
const StationItem: React.FC<{
  station: string;
  isSelected: boolean;
  isEmpty?: boolean;
  replaced?: string;
  count: number;
  lang: 'en' | 'ja';
  onClick: () => void;
  showReplacement?: boolean;
}> = ({ station, isSelected, isEmpty, replaced, count, lang, onClick, showReplacement = true }) => (
  <div
    onClick={onClick}
    className={`p-3 rounded-lg border cursor-pointer transition-all ${
      isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
    }`}
  >
    <div className="flex items-center gap-3">
      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
        isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
      }`}>
        {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className={`font-mono px-2 py-0.5 rounded ${
            isEmpty ? 'bg-gray-200 text-gray-500 italic' : replaced ? 'bg-red-100 text-red-700 line-through' : 'bg-gray-100'
          }`}>{station}</span>
          {showReplacement && isSelected && replaced && (
            <>
              <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">{replaced}</span>
            </>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-1">{count}{lang === 'ja' ? '枚の写真' : ' photos'}</div>
      </div>
    </div>
  </div>
);

const StationReplaceModal: React.FC<StationReplaceModalProps> = ({ photos, lang, onClose, onReplace }) => {
  const [mode, setMode] = useState<'replace' | 'write'>('write');
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [selectedStations, setSelectedStations] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [stationHistory, setStationHistory] = useState<string[]>([]);

  useEffect(() => { setStationHistory(getStationHistory()); }, []);

  const stationStats = useMemo(() => {
    const stats = new Map<string, { count: number; fileNames: string[]; isEmpty: boolean }>();
    photos.forEach(photo => {
      const station = photo.analysis?.station || '';
      const key = station || EMPTY_STATION_LABEL;
      if (!stats.has(key)) stats.set(key, { count: 0, fileNames: [], isEmpty: !station });
      const s = stats.get(key)!;
      s.count++;
      s.fileNames.push(photo.fileName);
    });
    return Array.from(stats.entries())
      .map(([station, data]) => ({ station, ...data }))
      .sort((a, b) => (a.isEmpty !== b.isEmpty ? (a.isEmpty ? 1 : -1) : b.count - a.count));
  }, [photos]);

  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const previewReplacements = useMemo(() => {
    if (mode === 'write') {
      return stationStats
        .filter(({ station }) => selectedStations.has(station))
        .map(({ station, fileNames, isEmpty }) => ({ original: station, replaced: replaceText, fileNames, isEmpty }));
    }
    if (!searchText) return [];
    return stationStats
      .filter(({ station, isEmpty }) => !isEmpty && station.includes(searchText))
      .map(({ station, fileNames, isEmpty }) => ({
        original: station,
        replaced: station.replace(new RegExp(escapeRegex(searchText), 'g'), replaceText),
        fileNames,
        isEmpty
      }));
  }, [mode, searchText, replaceText, stationStats, selectedStations]);

  useEffect(() => {
    if (mode === 'replace' && searchText) {
      setSelectedStations(new Set(stationStats.filter(s => !s.isEmpty && s.station.includes(searchText)).map(s => s.station)));
    }
  }, [mode, searchText, stationStats]);

  const toggleStation = (station: string) => {
    const newSet = new Set(selectedStations);
    newSet.has(station) ? newSet.delete(station) : newSet.add(station);
    setSelectedStations(newSet);
  };

  const handleApply = () => {
    const replacements: Array<{ fileName: string; newStation: string }> = [];
    if (mode === 'write') {
      stationStats.filter(s => selectedStations.has(s.station)).forEach(s => s.fileNames.forEach(fn => replacements.push({ fileName: fn, newStation: replaceText })));
      if (replaceText) addStationToHistory(replaceText);
    } else {
      previewReplacements.filter(r => selectedStations.has(r.original)).forEach(r => r.fileNames.forEach(fn => replacements.push({ fileName: fn, newStation: r.replaced })));
      (Array.from(new Set(previewReplacements.map(r => r.replaced))) as string[]).forEach(r => r && addStationToHistory(r));
    }
    if (replacements.length > 0) { onReplace(replacements); onClose(); }
  };

  const affectedCount = stationStats.filter(s => selectedStations.has(s.station)).reduce((sum, s) => sum + s.fileNames.length, 0);
  const canApply = affectedCount > 0 && (mode !== 'write' || replaceText);

  const tabs = [
    { key: 'write', icon: Edit3, label: lang === 'ja' ? '書き換え' : 'Set Value' },
    { key: 'replace', icon: Search, label: lang === 'ja' ? '検索置換' : 'Find & Replace' }
  ] as const;

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <Replace className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">{lang === 'ja' ? '測点の編集' : 'Edit Stations'}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b">
          {tabs.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => { setMode(key); if (key === 'write') setSearchText(''); }}
              className={`flex-1 py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                mode === key ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-blue-50 border-b">
          {mode === 'write' ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Edit3 className="w-3 h-3 inline mr-1" />{lang === 'ja' ? '新しい測点' : 'New Station Value'}
              </label>
              <div className="relative">
                <input type="text" value={replaceText} onChange={e => setReplaceText(e.target.value)}
                  placeholder={lang === 'ja' ? '例: 小峯2丁目 No.4' : 'e.g., Street No.4'}
                  className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                {stationHistory.length > 0 && (
                  <button type="button" onClick={() => setShowHistory(!showHistory)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded"
                    title={lang === 'ja' ? '履歴から選択' : 'Select from history'}>
                    <History className="w-4 h-4 text-gray-500" />
                  </button>
                )}
                {showHistory && stationHistory.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    <div className="p-2 text-xs text-gray-500 border-b flex items-center gap-1">
                      <History className="w-3 h-3" />{lang === 'ja' ? '最近使用した測点' : 'Recent stations'}
                    </div>
                    {stationHistory.map((s, i) => (
                      <button key={i} type="button" onClick={() => { setReplaceText(s); setShowHistory(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 font-mono text-sm border-b last:border-b-0">{s}</button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">{lang === 'ja' ? '下のリストから書き換えたい測点を選択してください' : 'Select stations below to overwrite'}</p>
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1"><Search className="w-3 h-3 inline mr-1" />{lang === 'ja' ? '検索' : 'Find'}</label>
                <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                  placeholder={lang === 'ja' ? '置換する文字列...' : 'Text to find...'}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 mt-5" />
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1"><Replace className="w-3 h-3 inline mr-1" />{lang === 'ja' ? '置換後' : 'Replace with'}</label>
                <input type="text" value={replaceText} onChange={e => setReplaceText(e.target.value)}
                  placeholder={lang === 'ja' ? '置換後の文字列...' : 'Replacement text...'}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          )}
          <div className="mt-2 flex justify-between items-center">
            <span className="text-sm text-blue-700">
              {selectedStations.size > 0 ? `${selectedStations.size}${lang === 'ja' ? '件選択中' : ' selected'}` : (lang === 'ja' ? '選択なし' : 'None selected')}
            </span>
            <div className="flex gap-2">
              {selectedStations.size > 0 && (
                <button onClick={() => setSelectedStations(new Set())} className="text-xs text-gray-600 hover:text-gray-800 underline">
                  {lang === 'ja' ? '選択解除' : 'Clear'}
                </button>
              )}
              <button onClick={() => setSelectedStations(new Set(mode === 'write' ? stationStats.map(s => s.station) : stationStats.filter(s => !s.isEmpty && s.station.includes(searchText)).map(s => s.station)))}
                className="text-xs text-blue-600 hover:text-blue-800 underline">{lang === 'ja' ? 'すべて選択' : 'Select all'}</button>
            </div>
          </div>
        </div>

        {/* Station List */}
        <div className="flex-1 overflow-y-auto p-4">
          {stationStats.length === 0 ? (
            <div className="text-center text-gray-500 py-8">{lang === 'ja' ? '写真データがありません' : 'No photo data'}</div>
          ) : mode === 'write' ? (
            <div className="space-y-2">
              {stationStats.map(s => (
                <StationItem key={s.station} station={s.station} isSelected={selectedStations.has(s.station)} isEmpty={s.isEmpty}
                  replaced={replaceText} count={s.count} lang={lang} onClick={() => toggleStation(s.station)} />
              ))}
            </div>
          ) : searchText ? (
            previewReplacements.length === 0 ? (
              <div className="text-center text-gray-500 py-8 flex items-center justify-center gap-2">
                <AlertTriangle className="w-5 h-5" />{lang === 'ja' ? 'マッチする測点がありません' : 'No matching stations'}
              </div>
            ) : (
              <div className="space-y-2">
                {previewReplacements.map(r => (
                  <StationItem key={r.original} station={r.original} isSelected={selectedStations.has(r.original)}
                    replaced={r.replaced} count={r.fileNames.length} lang={lang} onClick={() => toggleStation(r.original)} />
                ))}
              </div>
            )
          ) : (
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">{lang === 'ja' ? '測点をクリックして検索:' : 'Click a station to search:'}</div>
              <div className="space-y-1">
                {stationStats.map(s => (
                  <div key={s.station} onClick={() => !s.isEmpty && setSearchText(s.station)}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer ${s.isEmpty ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
                    <span className={`font-mono text-sm ${s.isEmpty ? 'text-gray-500 italic' : ''}`}>{s.station}</span>
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{s.count}{lang === 'ja' ? '枚' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {affectedCount > 0 && (
              <span className="text-blue-600 font-medium">
                {affectedCount}{lang === 'ja' ? '枚を更新予定' : ' photos will be updated'}
                {mode === 'write' && replaceText && <span className="ml-2 font-mono bg-green-100 text-green-700 px-1 rounded">→ {replaceText}</span>}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
              {lang === 'ja' ? 'キャンセル' : 'Cancel'}
            </button>
            <button onClick={handleApply} disabled={!canApply}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${canApply ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
              {mode === 'write' ? <><Edit3 className="w-4 h-4" />{lang === 'ja' ? '書き換え実行' : 'Apply'}</> : <><Replace className="w-4 h-4" />{lang === 'ja' ? '置換実行' : 'Replace'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StationReplaceModal;
