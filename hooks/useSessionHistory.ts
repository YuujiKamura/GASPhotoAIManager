import React, { useState, useEffect, useCallback } from 'react';
import { AnalysisHistoryEntry } from '../types';
import {
  getAnalysisHistory,
  deleteAnalysisHistory,
  clearAnalysisHistory,
  toggleHistoryAsExample,
  updateHistoryName,
  getActiveExampleHistoryId,
  setActiveExampleHistory
} from '../utils/storage';

export function useSessionHistory() {
  const [entries, setEntries] = useState<AnalysisHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    loadHistory();
    setActiveExampleId(getActiveExampleHistoryId());
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const history = await getAnalysisHistory();
      setEntries(history);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('この履歴を削除しますか？')) return;
    try {
      await deleteAnalysisHistory(id);
      setEntries(prev => prev.filter(entry => entry.id !== id));
      if (activeExampleId === id) {
        setActiveExampleHistory(null);
        setActiveExampleId(null);
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }, [activeExampleId]);

  const handleClearAll = useCallback(async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    try {
      await clearAnalysisHistory();
      setEntries([]);
      setConfirmClear(false);
      setActiveExampleHistory(null);
      setActiveExampleId(null);
    } catch (err) {
      console.error('Failed to clear:', err);
    }
  }, [confirmClear]);

  const cancelClear = useCallback(() => {
    setConfirmClear(false);
  }, []);

  const handleToggleExample = useCallback(async (entry: AnalysisHistoryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !entry.isExampleSession;
    try {
      const updated = await toggleHistoryAsExample(entry.id, newState);
      if (updated) {
        setEntries(prev => prev.map(ent => ent.id === entry.id ? updated : ent));
        if (newState) {
          setActiveExampleHistory(entry.id);
          setActiveExampleId(entry.id);
        } else if (activeExampleId === entry.id) {
          setActiveExampleHistory(null);
          setActiveExampleId(null);
        }
      }
    } catch (err) {
      console.error('Failed to toggle example:', err);
    }
  }, [activeExampleId]);

  const handleSetActive = useCallback((entry: AnalysisHistoryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry.isExampleSession) return;
    if (activeExampleId === entry.id) {
      setActiveExampleHistory(null);
      setActiveExampleId(null);
    } else {
      setActiveExampleHistory(entry.id);
      setActiveExampleId(entry.id);
    }
  }, [activeExampleId]);

  const clearActiveExample = useCallback(() => {
    setActiveExampleHistory(null);
    setActiveExampleId(null);
  }, []);

  const handleStartEdit = useCallback((entry: AnalysisHistoryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(entry.id);
    setEditName(entry.name || '');
  }, []);

  const handleSaveName = useCallback(async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await updateHistoryName(id, editName.trim());
      setEntries(prev => prev.map(ent => ent.id === id ? { ...ent, name: editName.trim() } : ent));
    } catch (err) {
      console.error('Failed to update name:', err);
    }
    setEditingId(null);
  }, [editName]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const exampleCount = entries.filter(e => e.isExampleSession).length;

  const refresh = useCallback(() => {
    loadHistory();
  }, []);

  return {
    entries, loading, confirmClear, activeExampleId, editingId, editName, setEditName, exampleCount,
    handleDelete, handleClearAll, cancelClear,
    handleToggleExample, handleSetActive, clearActiveExample,
    handleStartEdit, handleSaveName, cancelEdit, refresh,
  };
}

export const formatFullDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
