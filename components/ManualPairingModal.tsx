import React, { useState, useMemo } from 'react';
import { X, ArrowRight, Trash2, Check, ArrowLeftRight } from 'lucide-react';
import { PhotoRecord } from '../types';

interface ManualPair {
  before: PhotoRecord;
  after: PhotoRecord;
  id: string;
}

interface Props {
  photos: PhotoRecord[];
  onComplete: (pairs: ManualPair[]) => void;
  onCancel: () => void;
  lang: 'en' | 'ja';
}

const ManualPairingModal: React.FC<Props> = ({ photos, onComplete, onCancel, lang }) => {
  // 日付でソートして前半/後半に分割
  const { initialBefore, initialAfter } = useMemo(() => {
    const sorted = [...photos].sort((a, b) => (a.date || 0) - (b.date || 0));
    const midPoint = Math.ceil(sorted.length / 2);
    return {
      initialBefore: sorted.slice(0, midPoint),
      initialAfter: sorted.slice(midPoint)
    };
  }, [photos]);

  const [beforeCandidates, setBeforeCandidates] = useState<PhotoRecord[]>(initialBefore);
  const [afterCandidates, setAfterCandidates] = useState<PhotoRecord[]>(initialAfter);
  const [selectedBefore, setSelectedBefore] = useState<PhotoRecord | null>(null);
  const [selectedAfter, setSelectedAfter] = useState<PhotoRecord | null>(null);
  const [pairs, setPairs] = useState<ManualPair[]>([]);

  const txt = {
    title: lang === 'ja' ? '手動ペアリング' : 'Manual Pairing',
    beforeLabel: lang === 'ja' ? '着手前候補' : 'Before Candidates',
    afterLabel: lang === 'ja' ? '完了候補' : 'After Candidates',
    createPair: lang === 'ja' ? 'ペア作成' : 'Create Pair',
    createdPairs: lang === 'ja' ? '作成済みペア' : 'Created Pairs',
    noPairs: lang === 'ja' ? 'ペアがありません' : 'No pairs yet',
    complete: lang === 'ja' ? '完了' : 'Complete',
    cancel: lang === 'ja' ? 'キャンセル' : 'Cancel',
    moveToAfter: lang === 'ja' ? '完了側へ移動' : 'Move to After',
    moveToBefore: lang === 'ja' ? '着手前へ移動' : 'Move to Before',
  };

  const handleCreatePair = () => {
    if (!selectedBefore || !selectedAfter) return;

    const newPair: ManualPair = {
      before: selectedBefore,
      after: selectedAfter,
      id: `MANUAL_${Date.now()}`
    };

    setPairs(prev => [...prev, newPair]);

    // 使用済み写真を候補から削除
    setBeforeCandidates(prev => prev.filter(p => p.fileName !== selectedBefore.fileName));
    setAfterCandidates(prev => prev.filter(p => p.fileName !== selectedAfter.fileName));

    setSelectedBefore(null);
    setSelectedAfter(null);
  };

  const handleRemovePair = (pairId: string) => {
    const pair = pairs.find(p => p.id === pairId);
    if (!pair) return;

    // ペアを削除し、写真を候補に戻す
    setPairs(prev => prev.filter(p => p.id !== pairId));
    setBeforeCandidates(prev => [...prev, pair.before].sort((a, b) => (a.date || 0) - (b.date || 0)));
    setAfterCandidates(prev => [...prev, pair.after].sort((a, b) => (a.date || 0) - (b.date || 0)));
  };

  const handleMoveToAfter = (photo: PhotoRecord) => {
    setBeforeCandidates(prev => prev.filter(p => p.fileName !== photo.fileName));
    setAfterCandidates(prev => [...prev, photo].sort((a, b) => (a.date || 0) - (b.date || 0)));
    if (selectedBefore?.fileName === photo.fileName) setSelectedBefore(null);
  };

  const handleMoveToBefore = (photo: PhotoRecord) => {
    setAfterCandidates(prev => prev.filter(p => p.fileName !== photo.fileName));
    setBeforeCandidates(prev => [...prev, photo].sort((a, b) => (a.date || 0) - (b.date || 0)));
    if (selectedAfter?.fileName === photo.fileName) setSelectedAfter(null);
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const PhotoThumbnail: React.FC<{
    photo: PhotoRecord;
    isSelected: boolean;
    onClick: () => void;
    onMove: () => void;
    moveLabel: string;
  }> = ({ photo, isSelected, onClick, onMove, moveLabel }) => (
    <div
      className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
        isSelected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200 hover:border-gray-400'
      }`}
      onClick={onClick}
    >
      <img
        src={photo.base64}
        alt={photo.fileName}
        className="w-full h-24 object-cover"
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
      {isSelected && (
        <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full p-1">
          <Check className="w-3 h-3" />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
        {photo.fileName.replace(/\.[^.]+$/, '')}
      </div>
      <div className="absolute top-0 left-0 bg-black/60 text-white text-[9px] px-1">
        {formatDate(photo.date)}
      </div>
      {/* 移動ボタン */}
      <button
        onClick={(e) => { e.stopPropagation(); onMove(); }}
        className="absolute top-1 left-1 bg-gray-800/80 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        title={moveLabel}
      >
        <ArrowLeftRight className="w-3 h-3" />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-xl font-bold text-gray-800">{txt.title}</h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Two Column Selection */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Before Candidates */}
            <div>
              <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-sm">
                  {txt.beforeLabel}
                </span>
                <span className="text-sm text-gray-500">({beforeCandidates.length})</span>
              </h4>
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-50 rounded-lg">
                {beforeCandidates.map(photo => (
                  <PhotoThumbnail
                    key={photo.fileName}
                    photo={photo}
                    isSelected={selectedBefore?.fileName === photo.fileName}
                    onClick={() => setSelectedBefore(photo)}
                    onMove={() => handleMoveToAfter(photo)}
                    moveLabel={txt.moveToAfter}
                  />
                ))}
                {beforeCandidates.length === 0 && (
                  <div className="col-span-3 text-center text-gray-400 py-4">---</div>
                )}
              </div>
            </div>

            {/* After Candidates */}
            <div>
              <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-sm">
                  {txt.afterLabel}
                </span>
                <span className="text-sm text-gray-500">({afterCandidates.length})</span>
              </h4>
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-50 rounded-lg">
                {afterCandidates.map(photo => (
                  <PhotoThumbnail
                    key={photo.fileName}
                    photo={photo}
                    isSelected={selectedAfter?.fileName === photo.fileName}
                    onClick={() => setSelectedAfter(photo)}
                    onMove={() => handleMoveToBefore(photo)}
                    moveLabel={txt.moveToBefore}
                  />
                ))}
                {afterCandidates.length === 0 && (
                  <div className="col-span-3 text-center text-gray-400 py-4">---</div>
                )}
              </div>
            </div>
          </div>

          {/* Create Pair Button */}
          <div className="flex justify-center mb-6">
            <button
              onClick={handleCreatePair}
              disabled={!selectedBefore || !selectedAfter}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all ${
                selectedBefore && selectedAfter
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {txt.createPair}
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Created Pairs */}
          <div>
            <h4 className="font-bold text-gray-700 mb-2">
              {txt.createdPairs} ({pairs.length})
            </h4>
            <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
              {pairs.length === 0 ? (
                <div className="text-center text-gray-400 py-4">{txt.noPairs}</div>
              ) : (
                <div className="space-y-2">
                  {pairs.map((pair, idx) => (
                    <div
                      key={pair.id}
                      className="flex items-center gap-3 bg-white p-2 rounded-lg border"
                    >
                      <span className="text-sm font-mono text-gray-500 w-6">{idx + 1}.</span>
                      <img src={pair.before.base64} className="w-12 h-12 object-cover rounded" />
                      <span className="text-xs text-gray-600 truncate max-w-24">{pair.before.fileName}</span>
                      <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <img src={pair.after.base64} className="w-12 h-12 object-cover rounded" />
                      <span className="text-xs text-gray-600 truncate max-w-24">{pair.after.fileName}</span>
                      <button
                        onClick={() => handleRemovePair(pair.id)}
                        className="ml-auto text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-bold"
          >
            {txt.cancel}
          </button>
          <button
            onClick={() => onComplete(pairs)}
            disabled={pairs.length === 0}
            className={`flex-1 py-3 rounded-lg font-bold shadow-md flex items-center justify-center gap-2 ${
              pairs.length > 0
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Check className="w-5 h-5" />
            {txt.complete} ({pairs.length})
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualPairingModal;
