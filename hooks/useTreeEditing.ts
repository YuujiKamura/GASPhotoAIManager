import { useState, useCallback } from 'react';
import { CustomizationData } from '../utils/masterEditorStorage';

export function useTreeEditing(
  path: string,
  customization: CustomizationData,
  onRename: (path: string, oldKey: string, newKey: string) => void,
  onAdd: (parentPath: string, name: string) => void
) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newEntryName, setNewEntryName] = useState('');

  const startEdit = useCallback((key: string) => {
    const fullPath = path ? `${path}/${key}` : key;
    const displayName = customization.renamedPaths[fullPath] || key;
    setEditingKey(key);
    setEditValue(displayName);
  }, [path, customization.renamedPaths]);

  const saveEdit = useCallback((originalKey: string) => {
    if (editValue.trim() && editValue !== originalKey) {
      const fullPath = path ? `${path}/${originalKey}` : originalKey;
      onRename(fullPath, originalKey, editValue.trim());
    }
    setEditingKey(null);
    setEditValue('');
  }, [path, editValue, onRename]);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditValue('');
  }, []);

  const startAdding = useCallback((fullPath: string) => {
    setAddingTo(fullPath);
    setNewEntryName('');
  }, []);

  const handleAddEntry = useCallback(() => {
    if (newEntryName.trim() && addingTo) {
      onAdd(addingTo, newEntryName.trim());
      setAddingTo(null);
      setNewEntryName('');
    }
  }, [addingTo, newEntryName, onAdd]);

  const cancelAdding = useCallback(() => {
    setAddingTo(null);
    setNewEntryName('');
  }, []);

  return {
    state: {
      editingKey,
      editValue,
      addingTo,
      newEntryName,
    },
    setters: {
      setEditValue,
      setNewEntryName,
    },
    actions: {
      startEdit,
      saveEdit,
      cancelEdit,
      startAdding,
      handleAddEntry,
      cancelAdding,
    },
  };
}
