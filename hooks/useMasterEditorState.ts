import React, { useState, useEffect, useCallback } from 'react';
import {
  CustomizationData,
  WorkTypeData,
  collectAllWorkTypes,
  loadEnabledWorkTypes,
  saveEnabledWorkTypes,
  loadCustomization,
  saveCustomization,
  WORK_TYPE_CATEGORY_ORDER,
  UNCATEGORIZED_ORDER
} from '../utils/masterEditorStorage';

export type ViewMode = 'list' | 'detail' | 'alias';

export function useMasterEditorState() {
  const [allWorkTypes] = useState<Map<string, WorkTypeData>>(() => collectAllWorkTypes());
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedWorkType, setSelectedWorkType] = useState<WorkTypeData | null>(null);
  const [customization, setCustomization] = useState<CustomizationData>({
    deletedPaths: [],
    renamedPaths: {},
    addedEntries: []
  });

  useEffect(() => {
    const enabled = loadEnabledWorkTypes();
    setEnabledTypes(new Set(enabled));
    setCustomization(loadCustomization());
  }, []);

  const toggleWorkType = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEnabledTypes(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    saveEnabledWorkTypes(Array.from(enabledTypes));
    saveCustomization(customization);
    setHasChanges(false);
  }, [enabledTypes, customization]);

  const handleSelectAll = useCallback(() => {
    setEnabledTypes(new Set(allWorkTypes.keys()));
    setHasChanges(true);
  }, [allWorkTypes]);

  const handleClearAll = useCallback(() => {
    setEnabledTypes(new Set());
    setHasChanges(true);
  }, []);

  const openDetailEdit = useCallback((workType: WorkTypeData, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedWorkType(workType);
    setViewMode('detail');
  }, []);

  const handleDelete = useCallback((path: string, _key: string, _deletedValue: unknown) => {
    setCustomization(prev => ({
      ...prev,
      deletedPaths: [...prev.deletedPaths, path]
    }));
    setHasChanges(true);
  }, []);

  const handleRename = useCallback((path: string, _oldKey: string, newKey: string) => {
    setCustomization(prev => ({
      ...prev,
      renamedPaths: { ...prev.renamedPaths, [path]: newKey }
    }));
    setHasChanges(true);
  }, []);

  const handleAdd = useCallback((parentPath: string, name: string, _value: unknown) => {
    setCustomization(prev => ({
      ...prev,
      addedEntries: [...prev.addedEntries, { parentPath, name }]
    }));
    setHasChanges(true);
  }, []);

  const handleResetCustomization = useCallback(() => {
    if (selectedWorkType) {
      const workTypeName = selectedWorkType.name;
      setCustomization(prev => ({
        deletedPaths: prev.deletedPaths.filter(p => !p.startsWith(workTypeName + '/') && p !== workTypeName),
        renamedPaths: Object.fromEntries(
          Object.entries(prev.renamedPaths).filter(([p]) => !p.startsWith(workTypeName + '/') && p !== workTypeName)
        ),
        addedEntries: prev.addedEntries.filter(e => !e.parentPath.startsWith(workTypeName + '/') && e.parentPath !== workTypeName)
      }));
      setHasChanges(true);
    }
  }, [selectedWorkType]);

  // フィルタリングとソート済みの工種リスト
  const workTypeList: WorkTypeData[] = (Array.from(allWorkTypes.values()) as WorkTypeData[])
    .filter((w) => w.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const orderA = WORK_TYPE_CATEGORY_ORDER[a.name] ?? UNCATEGORIZED_ORDER;
      const orderB = WORK_TYPE_CATEGORY_ORDER[b.name] ?? UNCATEGORIZED_ORDER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name, 'ja');
    });

  // 工種がカスタマイズされているかチェック
  const hasWorkTypeCustomization = useCallback((workTypeName: string) => {
    return customization.deletedPaths.some(p => p.startsWith(workTypeName + '/') || p === workTypeName) ||
      Object.keys(customization.renamedPaths).some(p => p.startsWith(workTypeName + '/') || p === workTypeName) ||
      customization.addedEntries.some(e => e.parentPath.startsWith(workTypeName + '/') || e.parentPath === workTypeName);
  }, [customization]);

  return {
    allWorkTypes,
    enabledTypes,
    hasChanges,
    searchTerm,
    setSearchTerm,
    viewMode,
    setViewMode,
    selectedWorkType,
    customization,
    workTypeList,
    toggleWorkType,
    handleSave,
    handleSelectAll,
    handleClearAll,
    openDetailEdit,
    handleDelete,
    handleRename,
    handleAdd,
    handleResetCustomization,
    hasWorkTypeCustomization
  };
}
