import { useState, useEffect, useCallback } from 'react';
import { PhotoRecord } from '../types';

export type PhotoGroup = { detail: string; photos: PhotoRecord[] };

interface UseReorderModeResult {
  isReorderMode: boolean;
  reorderType: 'group' | 'single';
  reorderedGroups: PhotoGroup[];
  reorderedSinglePhotos: PhotoRecord[];
  draggedGroupIndex: number | null;
  draggedPhotoIndex: number | null;
  setReorderType: (type: 'group' | 'single') => void;
  enterReorderMode: () => void;
  handleGroupDragStart: (index: number) => void;
  handleGroupDragOver: (e: React.DragEvent, index: number) => void;
  handleGroupDragEnd: () => void;
  handlePhotoDragStart: (index: number) => void;
  handlePhotoDragOver: (e: React.DragEvent, index: number) => void;
  handlePhotoDragEnd: () => void;
  handleSaveReorder: () => void;
  handleCancelReorder: () => void;
}

export function useReorderMode(
  photos: PhotoRecord[],
  onReorderPhotos?: (reorderedPhotos: PhotoRecord[]) => void
): UseReorderModeResult {
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [reorderType, setReorderType] = useState<'group' | 'single'>('group');
  const [reorderedGroups, setReorderedGroups] = useState<PhotoGroup[]>([]);
  const [reorderedSinglePhotos, setReorderedSinglePhotos] = useState<PhotoRecord[]>([]);
  const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(null);
  const [draggedPhotoIndex, setDraggedPhotoIndex] = useState<number | null>(null);

  // Initialize groups/photos when entering reorder mode
  useEffect(() => {
    if (isReorderMode) {
      setReorderedSinglePhotos([...photos]);

      // Group photos by detail (maintain appearance order)
      const groupMap = new Map<string, PhotoRecord[]>();
      const groupOrder: string[] = [];

      photos.forEach(photo => {
        const detail = photo.analysis?.detail || photo.analysis?.variety || '未分類';
        if (!groupMap.has(detail)) {
          groupMap.set(detail, []);
          groupOrder.push(detail);
        }
        groupMap.get(detail)!.push(photo);
      });

      const groups: PhotoGroup[] = groupOrder.map(detail => ({
        detail,
        photos: groupMap.get(detail)!
      }));

      setReorderedGroups(groups);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReorderMode]);

  const enterReorderMode = useCallback(() => {
    setIsReorderMode(true);
  }, []);

  // Generic drag handler factory
  const createDragHandlers = <T,>(
    items: T[],
    setItems: React.Dispatch<React.SetStateAction<T[]>>,
    draggedIndex: number | null,
    setDraggedIndex: React.Dispatch<React.SetStateAction<number | null>>
  ) => ({
    handleDragStart: (index: number) => setDraggedIndex(index),
    handleDragOver: (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === index) return;
      const newItems = [...items];
      const draggedItem = newItems[draggedIndex];
      newItems.splice(draggedIndex, 1);
      newItems.splice(index, 0, draggedItem);
      setItems(newItems);
      setDraggedIndex(index);
    },
    handleDragEnd: () => setDraggedIndex(null)
  });

  const groupHandlers = createDragHandlers(
    reorderedGroups,
    setReorderedGroups,
    draggedGroupIndex,
    setDraggedGroupIndex
  );

  const photoHandlers = createDragHandlers(
    reorderedSinglePhotos,
    setReorderedSinglePhotos,
    draggedPhotoIndex,
    setDraggedPhotoIndex
  );

  const handleSaveReorder = useCallback(() => {
    if (onReorderPhotos) {
      if (reorderType === 'group') {
        const reorderedPhotos = reorderedGroups.flatMap(g => g.photos);
        onReorderPhotos(reorderedPhotos);
      } else {
        onReorderPhotos(reorderedSinglePhotos);
      }
    }
    setReorderedGroups([]);
    setReorderedSinglePhotos([]);
    setIsReorderMode(false);
  }, [onReorderPhotos, reorderType, reorderedGroups, reorderedSinglePhotos]);

  const handleCancelReorder = useCallback(() => {
    setReorderedGroups([]);
    setReorderedSinglePhotos([]);
    setIsReorderMode(false);
  }, []);

  return {
    isReorderMode,
    reorderType,
    reorderedGroups,
    reorderedSinglePhotos,
    draggedGroupIndex,
    draggedPhotoIndex,
    setReorderType,
    enterReorderMode,
    handleGroupDragStart: groupHandlers.handleDragStart,
    handleGroupDragOver: groupHandlers.handleDragOver,
    handleGroupDragEnd: groupHandlers.handleDragEnd,
    handlePhotoDragStart: photoHandlers.handleDragStart,
    handlePhotoDragOver: photoHandlers.handleDragOver,
    handlePhotoDragEnd: photoHandlers.handleDragEnd,
    handleSaveReorder,
    handleCancelReorder
  };
}
