import React, { useState, useMemo, useEffect } from 'react';
import { X, Replace, Search, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PhotoRecord } from '../types';

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
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [selectedStations, setSelectedStations] = useState<Set<string>>(new Set());

  // Debug: Log props on mount
  console.log('[DEBUG StationReplaceModal] photos received:', photos.length);
  console.log('[DEBUG StationReplaceModal] photos with station:',
    photos.filter(p => p.analysis?.station).length);

  // Get unique stations with their counts
  const stationStats = useMemo(() => {
    console.log('[DEBUG stationStats] Computing for', photos.length, 'photos');
    const stats = new Map<string, { count: number; fileNames: string[] }>();
    photos.forEach(photo => {
      const station = photo.analysis?.station || '';
      if (station) {
        if (!stats.has(station)) {
          stats.set(station, { count: 0, fileNames: [] });
        }
        const s = stats.get(station)!;
        s.count++;
        s.fileNames.push(photo.fileName);
      }
    });
    const result = Array.from(stats.entries())
      .map(([station, data]) => ({ station, ...data }))
      .sort((a, b) => b.count - a.count);
    console.log('[DEBUG stationStats] Found stations:', result.map(r => `"${r.station}" (${r.count})`));
    return result;
  }, [photos]);

  // Preview replacements
  const previewReplacements = useMemo(() => {
    if (!searchText) return [];

    const replacements: Array<{ original: string; replaced: string; fileNames: string[] }> = [];
    stationStats.forEach(({ station, fileNames }) => {
      if (station.includes(searchText)) {
        const replaced = station.replace(new RegExp(searchText, 'g'), replaceText);
        replacements.push({ original: station, replaced, fileNames });
      }
    });
    return replacements;
  }, [searchText, replaceText, stationStats]);

  // Auto-select all matching stations when search text changes
  useEffect(() => {
    if (previewReplacements.length > 0) {
      const matching = new Set<string>();
      previewReplacements.forEach(r => matching.add(r.original));
      setSelectedStations(matching);
      console.log('[DEBUG] Auto-selected', matching.size, 'stations');
    } else {
      setSelectedStations(new Set());
    }
  }, [previewReplacements]);

  // Handle select all matching
  const handleSelectAllMatching = () => {
    const matching = new Set<string>();
    previewReplacements.forEach(r => matching.add(r.original));
    setSelectedStations(matching);
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
    console.log('[DEBUG handleApply] Called');
    console.log('[DEBUG handleApply] selectedStations:', Array.from(selectedStations));
    console.log('[DEBUG handleApply] previewReplacements:', previewReplacements);

    const replacements: Array<{ fileName: string; newStation: string }> = [];

    previewReplacements.forEach(({ original, replaced, fileNames }) => {
      console.log(`[DEBUG] Checking "${original}" - selected: ${selectedStations.has(original)}`);
      if (selectedStations.has(original)) {
        fileNames.forEach(fileName => {
          replacements.push({ fileName, newStation: replaced });
        });
      }
    });

    console.log('[DEBUG handleApply] Final replacements:', replacements);

    if (replacements.length > 0) {
      console.log('[DEBUG handleApply] Calling onReplace with', replacements.length, 'items');
      // デバッグ用のアラート
      alert(`置換実行: ${replacements.length}件\n${replacements.map(r => `${r.fileName}: ${r.newStation}`).join('\n')}`);
      onReplace(replacements);
      onClose();
    } else {
      console.warn('[DEBUG handleApply] No replacements to apply - nothing selected?');
      alert('置換対象がありません。検索テキストを入力してマッチする測点を選択してください。');
    }
  };

  const affectedCount = previewReplacements
    .filter(r => selectedStations.has(r.original))
    .reduce((sum, r) => sum + r.fileNames.length, 0);

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <Replace className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">
              {lang === 'ja' ? '測点の一括置換' : 'Bulk Station Replace'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search/Replace Inputs */}
        <div className="p-4 bg-blue-50 border-b">
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
          {previewReplacements.length > 0 && (
            <div className="mt-2 flex justify-between items-center">
              <span className="text-sm text-blue-700">
                {previewReplacements.length}{lang === 'ja' ? '件マッチ' : ' matches'}
              </span>
              <button
                onClick={handleSelectAllMatching}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                {lang === 'ja' ? 'すべて選択' : 'Select all'}
              </button>
            </div>
          )}
        </div>

        {/* Debug Info */}
        <div className="px-4 py-2 bg-yellow-100 border-b text-xs font-mono">
          <div>📊 photos: {photos.length}枚 | 測点あり: {photos.filter(p => p.analysis?.station).length}枚</div>
          <div>🔍 stationStats: {stationStats.length}種類 | selected: {selectedStations.size}件</div>
          <div>📝 search: "{searchText}" | replace: "{replaceText}" | preview: {previewReplacements.length}件</div>
        </div>

        {/* Station List */}
        <div className="flex-1 overflow-y-auto p-4">
          {stationStats.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <div>{lang === 'ja' ? '測点データがありません' : 'No station data'}</div>
              <div className="text-xs mt-2 text-red-500">
                (photos: {photos.length}枚, 測点なし: {photos.filter(p => !p.analysis?.station).length}枚)
              </div>
            </div>
          ) : searchText ? (
            // Show matched replacements
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
            // Show all stations
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">
                {lang === 'ja' ? '現在の測点一覧:' : 'Current stations:'}
              </div>
              <div className="space-y-1">
                {stationStats.map(({ station, count }) => (
                  <div
                    key={station}
                    className="flex items-center justify-between p-2 rounded bg-gray-50 hover:bg-gray-100 cursor-pointer"
                    onClick={() => setSearchText(station)}
                  >
                    <span className="font-mono text-sm">{station}</span>
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
                {affectedCount}{lang === 'ja' ? '枚を置換予定' : ' photos will be updated'}
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
              disabled={affectedCount === 0}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                affectedCount > 0
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Replace className="w-4 h-4" />
              {lang === 'ja' ? '置換実行' : 'Replace'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StationReplaceModal;
