import React, { useState, useMemo, useEffect } from 'react';
import { X, Replace, Search, ArrowRight, CheckCircle2, AlertTriangle, Edit3, List } from 'lucide-react';
import { PhotoRecord } from '../types';

// 空の測点を表示する際のラベル
const EMPTY_STATION_LABEL = '(空白)';

interface StationReplaceModalProps {
  photos: PhotoRecord[];
  lang: 'en' | 'ja';
  onClose: () => void;
  onReplace: (replacements: Array<{ fileName: string; newStation: string }>) => void;
}

const StationReplaceModal: React.FC<StationReplaceModalProps> = ({
  photos,
  lang,
  onClose,
  onReplace
}) => {
  const [mode, setMode] = useState<'replace' | 'write'>('write'); // 'replace': 置換, 'write': 書き換え
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [selectedStations, setSelectedStations] = useState<Set<string>>(new Set());

  // Get unique stations with their counts (空も含む)
  const stationStats = useMemo(() => {
    const stats = new Map<string, { count: number; fileNames: string[]; isEmpty: boolean }>();
    photos.forEach(photo => {
      const station = photo.analysis?.station || '';
      const key = station || EMPTY_STATION_LABEL;
      if (!stats.has(key)) {
        stats.set(key, { count: 0, fileNames: [], isEmpty: !station });
      }
      const s = stats.get(key)!;
      s.count++;
      s.fileNames.push(photo.fileName);
    });
    return Array.from(stats.entries())
      .map(([station, data]) => ({ station, ...data }))
      .sort((a, b) => {
        // 空白は最後に
        if (a.isEmpty && !b.isEmpty) return 1;
        if (!a.isEmpty && b.isEmpty) return -1;
        return b.count - a.count;
      });
  }, [photos]);

  // Escape special regex characters
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Preview replacements (mode によって動作が変わる)
  const previewReplacements = useMemo(() => {
    if (mode === 'write') {
      // 書き換えモード: 選択した測点を replaceText で置き換え
      return stationStats
        .filter(({ station }) => selectedStations.has(station))
        .map(({ station, fileNames, isEmpty }) => ({
          original: station,
          replaced: replaceText,
          fileNames,
          isEmpty
        }));
    } else {
      // 置換モード: searchText を含む測点を置換
      if (!searchText) return [];
      const replacements: Array<{ original: string; replaced: string; fileNames: string[]; isEmpty: boolean }> = [];
      const escapedSearch = escapeRegex(searchText);
      stationStats.forEach(({ station, fileNames, isEmpty }) => {
        if (!isEmpty && station.includes(searchText)) {
          const replaced = station.replace(new RegExp(escapedSearch, 'g'), replaceText);
          replacements.push({ original: station, replaced, fileNames, isEmpty });
        }
      });
      return replacements;
    }
  }, [mode, searchText, replaceText, stationStats, selectedStations]);

  // Auto-select all matching stations when search text changes (置換モードのみ)
  useEffect(() => {
    if (mode === 'replace' && searchText) {
      const matching = new Set<string>();
      stationStats.forEach(({ station, isEmpty }) => {
        if (!isEmpty && station.includes(searchText)) {
          matching.add(station);
        }
      });
      setSelectedStations(matching);
    }
  }, [mode, searchText, stationStats]);

  // Handle select all
  const handleSelectAll = () => {
    if (mode === 'write') {
      // 書き換えモード: すべての測点を選択
      const all = new Set<string>();
      stationStats.forEach(({ station }) => all.add(station));
      setSelectedStations(all);
    } else {
      // 置換モード: マッチする測点を選択
      const matching = new Set<string>();
      stationStats.forEach(({ station, isEmpty }) => {
        if (!isEmpty && station.includes(searchText)) {
          matching.add(station);
        }
      });
      setSelectedStations(matching);
    }
  };

  // Handle clear selection
  const handleClearSelection = () => {
    setSelectedStations(new Set());
  };

  // Handle individual station toggle
  const toggleStation = (station: string) => {
    const newSet = new Set(selectedStations);
    if (newSet.has(station)) {
      newSet.delete(station);
    } else {
      newSet.add(station);
    }
    setSelectedStations(newSet);
  };

  // Apply replacements
  const handleApply = () => {
    const replacements: Array<{ fileName: string; newStation: string }> = [];

    if (mode === 'write') {
      // 書き換えモード: 選択された測点のすべてを replaceText に書き換え
      stationStats.forEach(({ station, fileNames }) => {
        if (selectedStations.has(station)) {
          fileNames.forEach(fileName => {
            replacements.push({ fileName, newStation: replaceText });
          });
        }
      });
    } else {
      // 置換モード: マッチした測点を置換
      previewReplacements.forEach(({ original, replaced, fileNames }) => {
        if (selectedStations.has(original)) {
          fileNames.forEach(fileName => {
            replacements.push({ fileName, newStation: replaced });
          });
        }
      });
    }

    if (replacements.length > 0) {
      onReplace(replacements);
      onClose();
    }
  };

  // 影響を受ける写真の数を計算
  const affectedCount = useMemo(() => {
    let count = 0;
    stationStats.forEach(({ station, fileNames }) => {
      if (selectedStations.has(station)) {
        count += fileNames.length;
      }
    });
    return count;
  }, [stationStats, selectedStations]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <Replace className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">
              {lang === 'ja' ? '測点の編集' : 'Edit Stations'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => { setMode('write'); setSearchText(''); }}
            className={`flex-1 py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              mode === 'write'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Edit3 className="w-4 h-4" />
            {lang === 'ja' ? '書き換え' : 'Set Value'}
          </button>
          <button
            onClick={() => setMode('replace')}
            className={`flex-1 py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              mode === 'replace'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Search className="w-4 h-4" />
            {lang === 'ja' ? '検索置換' : 'Find & Replace'}
          </button>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-blue-50 border-b">
          {mode === 'write' ? (
            /* 書き換えモード: 新しい測点値のみ入力 */
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                <Edit3 className="w-3 h-3 inline mr-1" />
                {lang === 'ja' ? '新しい測点' : 'New Station Value'}
              </label>
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder={lang === 'ja' ? '例: 小峯2丁目 No.4' : 'e.g., Street No.4'}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {lang === 'ja'
                  ? '下のリストから書き換えたい測点を選択してください'
                  : 'Select stations below to overwrite'}
              </p>
            </div>
          ) : (
            /* 検索置換モード */
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <Search className="w-3 h-3 inline mr-1" />
                  {lang === 'ja' ? '検索' : 'Find'}
                </label>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={lang === 'ja' ? '置換する文字列...' : 'Text to find...'}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 mt-5" />
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <Replace className="w-3 h-3 inline mr-1" />
                  {lang === 'ja' ? '置換後' : 'Replace with'}
                </label>
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder={lang === 'ja' ? '置換後の文字列...' : 'Replacement text...'}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* 選択状況 */}
          <div className="mt-2 flex justify-between items-center">
            <span className="text-sm text-blue-700">
              {selectedStations.size > 0
                ? `${selectedStations.size}${lang === 'ja' ? '件選択中' : ' selected'}`
                : (lang === 'ja' ? '選択なし' : 'None selected')}
            </span>
            <div className="flex gap-2">
              {selectedStations.size > 0 && (
                <button
                  onClick={handleClearSelection}
                  className="text-xs text-gray-600 hover:text-gray-800 underline"
                >
                  {lang === 'ja' ? '選択解除' : 'Clear'}
                </button>
              )}
              <button
                onClick={handleSelectAll}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                {lang === 'ja' ? 'すべて選択' : 'Select all'}
              </button>
            </div>
          </div>
        </div>

        {/* Station List */}
        <div className="flex-1 overflow-y-auto p-4">
          {stationStats.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {lang === 'ja' ? '写真データがありません' : 'No photo data'}
            </div>
          ) : mode === 'write' ? (
            /* 書き換えモード: 全測点をチェックボックス付きで表示 */
            <div className="space-y-2">
              {stationStats.map(({ station, count, isEmpty }) => {
                const isSelected = selectedStations.has(station);
                return (
                  <div
                    key={station}
                    onClick={() => toggleStation(station)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-gray-300'
                      }`}>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className={`font-mono px-2 py-0.5 rounded ${
                            isEmpty ? 'bg-gray-200 text-gray-500 italic' : 'bg-gray-100'
                          }`}>
                            {station}
                          </span>
                          {isSelected && replaceText && (
                            <>
                              <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <span className="font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">
                                {replaceText}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {count}{lang === 'ja' ? '枚の写真' : ' photos'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : searchText ? (
            /* 検索置換モード: マッチした測点を表示 */
            previewReplacements.length === 0 ? (
              <div className="text-center text-gray-500 py-8 flex items-center justify-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                {lang === 'ja' ? 'マッチする測点がありません' : 'No matching stations'}
              </div>
            ) : (
              <div className="space-y-2">
                {previewReplacements.map(({ original, replaced, fileNames }) => (
                  <div
                    key={original}
                    onClick={() => toggleStation(original)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedStations.has(original)
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                        selectedStations.has(original)
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-gray-300'
                      }`}>
                        {selectedStations.has(original) && (
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono bg-red-100 text-red-700 px-2 py-0.5 rounded line-through">
                            {original}
                          </span>
                          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">
                            {replaced}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {fileNames.length}{lang === 'ja' ? '枚の写真' : ' photos'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* 検索置換モード: 検索前の測点一覧 */
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">
                {lang === 'ja' ? '測点をクリックして検索:' : 'Click a station to search:'}
              </div>
              <div className="space-y-1">
                {stationStats.map(({ station, count, isEmpty }) => (
                  <div
                    key={station}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer ${
                      isEmpty ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                    onClick={() => !isEmpty && setSearchText(station)}
                  >
                    <span className={`font-mono text-sm ${isEmpty ? 'text-gray-500 italic' : ''}`}>
                      {station}
                    </span>
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                      {count}{lang === 'ja' ? '枚' : ''}
                    </span>
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
                {mode === 'write' && replaceText && (
                  <span className="ml-2 font-mono bg-green-100 text-green-700 px-1 rounded">
                    → {replaceText}
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {lang === 'ja' ? 'キャンセル' : 'Cancel'}
            </button>
            <button
              onClick={handleApply}
              disabled={affectedCount === 0 || (mode === 'write' && !replaceText)}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                affectedCount > 0 && (mode !== 'write' || replaceText)
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {mode === 'write' ? (
                <>
                  <Edit3 className="w-4 h-4" />
                  {lang === 'ja' ? '書き換え実行' : 'Apply'}
                </>
              ) : (
                <>
                  <Replace className="w-4 h-4" />
                  {lang === 'ja' ? '置換実行' : 'Replace'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StationReplaceModal;
