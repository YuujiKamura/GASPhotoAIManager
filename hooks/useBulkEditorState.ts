import { useState, useMemo, useEffect, useCallback } from 'react';
import { PhotoRecord, AIAnalysisResult } from '../types';
import {
  getWorkTypeHistory, addWorkTypeToHistory,
  getStationHistory, addStationToHistory,
  getRemarksHistory, addRemarksToHistory,
  getMeasurementsHistory, addMeasurementsToHistory
} from '../utils/storage';

type FieldKey = keyof AIAnalysisResult;

export function useBulkEditorState(photos: PhotoRecord[]) {
  const [selectedField, setSelectedField] = useState<FieldKey>('workType');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [newValue, setNewValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('grouped');
  const [fieldHistory, setFieldHistory] = useState<string[]>([]);

  // Load history when field changes
  useEffect(() => {
    switch (selectedField) {
      case 'station':
        setFieldHistory(getStationHistory());
        break;
      case 'workType':
        setFieldHistory(getWorkTypeHistory());
        break;
      case 'remarks':
        setFieldHistory(getRemarksHistory());
        break;
      case 'measurements':
        setFieldHistory(getMeasurementsHistory());
        break;
      default:
        setFieldHistory([]);
    }
  }, [selectedField]);

  // Group photos by current field value
  const groupedPhotos = useMemo(() => {
    const groups = new Map<string, PhotoRecord[]>();
    photos.forEach(p => {
      const val = (p.analysis?.[selectedField] as string) || '';
      const key = val || '(空白)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    });
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === '(空白)') return 1;
      if (b[0] === '(空白)') return -1;
      return b[1].length - a[1].length;
    });
  }, [photos, selectedField]);

  // Value statistics
  const valueStats = useMemo(() => {
    const stats = new Map<string, number>();
    photos.forEach(p => {
      const val = (p.analysis?.[selectedField] as string) || '';
      stats.set(val, (stats.get(val) || 0) + 1);
    });
    return Array.from(stats.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }, [photos, selectedField]);

  const changeField = useCallback((field: FieldKey) => {
    setSelectedField(field);
    setSelectedPhotos(new Set());
    setNewValue('');
  }, []);

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) newSet.delete(groupKey);
      else newSet.add(groupKey);
      return newSet;
    });
  }, []);

  const toggleGroupSelection = useCallback((groupKey: string, groupPhotos: PhotoRecord[]) => {
    setSelectedPhotos(prev => {
      const newSet = new Set(prev);
      const allSelected = groupPhotos.every(p => newSet.has(p.fileName));
      if (allSelected) {
        groupPhotos.forEach(p => newSet.delete(p.fileName));
      } else {
        groupPhotos.forEach(p => newSet.add(p.fileName));
      }
      return newSet;
    });
  }, []);

  const togglePhoto = useCallback((fileName: string) => {
    setSelectedPhotos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileName)) newSet.delete(fileName);
      else newSet.add(fileName);
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedPhotos(new Set(photos.map(p => p.fileName)));
  }, [photos]);

  const clearSelection = useCallback(() => {
    setSelectedPhotos(new Set());
  }, []);

  const useExistingValue = useCallback((value: string) => {
    setNewValue(value === '(空白)' ? '' : value);
  }, []);

  const buildUpdates = useCallback(() => {
    if (selectedPhotos.size === 0 || !newValue) return [];
    const updates: Array<{ fileName: string; field: FieldKey; value: string }> = [];
    selectedPhotos.forEach(fileName => {
      updates.push({ fileName, field: selectedField, value: newValue });
    });
    // Add to history
    if (newValue) {
      switch (selectedField) {
        case 'station':
          addStationToHistory(newValue);
          break;
        case 'workType':
          addWorkTypeToHistory(newValue);
          break;
        case 'remarks':
          addRemarksToHistory(newValue);
          break;
        case 'measurements':
          addMeasurementsToHistory(newValue);
          break;
      }
    }
    return updates;
  }, [selectedPhotos, newValue, selectedField]);

  const canApply = selectedPhotos.size > 0 && !!newValue;

  return {
    selectedField, changeField,
    selectedPhotos, togglePhoto, toggleGroupSelection, selectAll, clearSelection,
    newValue, setNewValue, useExistingValue,
    showHistory, setShowHistory,
    expandedGroups, toggleGroup,
    viewMode, setViewMode,
    fieldHistory,
    groupedPhotos, valueStats,
    buildUpdates, canApply,
  };
}
