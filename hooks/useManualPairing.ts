import { useState, useMemo, useCallback } from 'react';
import { PhotoRecord } from '../types';

export interface ManualPair {
  before: PhotoRecord;
  after: PhotoRecord;
  id: string;
}

interface ManualPairingState {
  beforeCandidates: PhotoRecord[];
  afterCandidates: PhotoRecord[];
  selectedBefore: PhotoRecord | null;
  selectedAfter: PhotoRecord | null;
  pairs: ManualPair[];
}

interface ManualPairingActions {
  setSelectedBefore: (photo: PhotoRecord | null) => void;
  setSelectedAfter: (photo: PhotoRecord | null) => void;
  handleCreatePair: () => void;
  handleRemovePair: (pairId: string) => void;
  handleMoveToAfter: (photo: PhotoRecord) => void;
  handleMoveToBefore: (photo: PhotoRecord) => void;
}

export function useManualPairing(photos: PhotoRecord[]): ManualPairingState & ManualPairingActions {
  // Sort by date and split into before/after candidates
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

  const sortByDate = (a: PhotoRecord, b: PhotoRecord) => (a.date || 0) - (b.date || 0);

  const handleCreatePair = useCallback(() => {
    if (!selectedBefore || !selectedAfter) return;

    const newPair: ManualPair = {
      before: selectedBefore,
      after: selectedAfter,
      id: `MANUAL_${Date.now()}`
    };

    setPairs(prev => [...prev, newPair]);
    setBeforeCandidates(prev => prev.filter(p => p.fileName !== selectedBefore.fileName));
    setAfterCandidates(prev => prev.filter(p => p.fileName !== selectedAfter.fileName));
    setSelectedBefore(null);
    setSelectedAfter(null);
  }, [selectedBefore, selectedAfter]);

  const handleRemovePair = useCallback((pairId: string) => {
    const pair = pairs.find(p => p.id === pairId);
    if (!pair) return;

    setPairs(prev => prev.filter(p => p.id !== pairId));
    setBeforeCandidates(prev => [...prev, pair.before].sort(sortByDate));
    setAfterCandidates(prev => [...prev, pair.after].sort(sortByDate));
  }, [pairs]);

  const handleMoveToAfter = useCallback((photo: PhotoRecord) => {
    setBeforeCandidates(prev => prev.filter(p => p.fileName !== photo.fileName));
    setAfterCandidates(prev => [...prev, photo].sort(sortByDate));
    if (selectedBefore?.fileName === photo.fileName) setSelectedBefore(null);
  }, [selectedBefore]);

  const handleMoveToBefore = useCallback((photo: PhotoRecord) => {
    setAfterCandidates(prev => prev.filter(p => p.fileName !== photo.fileName));
    setBeforeCandidates(prev => [...prev, photo].sort(sortByDate));
    if (selectedAfter?.fileName === photo.fileName) setSelectedAfter(null);
  }, [selectedAfter]);

  return {
    beforeCandidates,
    afterCandidates,
    selectedBefore,
    selectedAfter,
    pairs,
    setSelectedBefore,
    setSelectedAfter,
    handleCreatePair,
    handleRemovePair,
    handleMoveToAfter,
    handleMoveToBefore
  };
}
