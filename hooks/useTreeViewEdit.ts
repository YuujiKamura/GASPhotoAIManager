import { useState, useCallback } from 'react';

interface UseTreeViewEditResult {
  editingKey: string | null;
  editValue: string;
  addingTo: string | null;
  newEntryName: string;
  setNewEntryName: (v: string) => void;
  startEdit: (key: string, displayName: string) => void;
  setEditValueDirect: (value: string) => void;
  saveEdit: (originalKey: string, path: string, onRename: (path: string, newName: string) => void) => void;
  cancelEdit: () => void;
  startAdding: (fullPath: string) => void;
  handleAddEntry: (path: string, onAdd: (parentPath: string, name: string) => void) => void;
  cancelAdding: () => void;
}

export function useTreeViewEdit(): UseTreeViewEditResult {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newEntryName, setNewEntryName] = useState('');

  const startEdit = useCallback((key: string, displayName: string) => {
    setEditingKey(key);
    setEditValue(displayName);
  }, []);

  const setEditValueDirect = useCallback((value: string) => {
    setEditValue(value);
  }, []);

  const saveEdit = useCallback((originalKey: string, path: string, onRename: (path: string, newName: string) => void) => {
    if (editValue.trim() && editValue !== originalKey) {
      onRename(path ? `${path}/${originalKey}` : originalKey, editValue.trim());
    }
    setEditingKey(null);
    setEditValue('');
  }, [editValue]);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditValue('');
  }, []);

  const startAdding = useCallback((fullPath: string) => {
    setAddingTo(fullPath);
    setNewEntryName('');
  }, []);

  const handleAddEntry = useCallback((path: string, onAdd: (parentPath: string, name: string) => void) => {
    if (newEntryName.trim()) {
      onAdd(path, newEntryName.trim());
      setAddingTo(null);
      setNewEntryName('');
    }
  }, [newEntryName]);

  const cancelAdding = useCallback(() => {
    setAddingTo(null);
    setNewEntryName('');
  }, []);

  return {
    editingKey,
    editValue,
    addingTo,
    newEntryName,
    setNewEntryName,
    startEdit,
    setEditValueDirect,
    saveEdit,
    cancelEdit,
    startAdding,
    handleAddEntry,
    cancelAdding,
  };
}
