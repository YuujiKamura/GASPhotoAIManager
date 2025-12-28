import { useState, useCallback } from 'react';
import {
  loadAliasSettings,
  saveAliasSettings,
  applyPreset,
  clearAliasSettings,
  AliasSettings,
  PresetKey
} from '../utils/workTypeAliases';

export function useMasterEditorAlias(onApplyAliasesToSession?: () => { modifiedCount: number }) {
  const [aliasSettings, setAliasSettings] = useState<AliasSettings>(loadAliasSettings());
  const [newWorkTypeFrom, setNewWorkTypeFrom] = useState('');
  const [newWorkTypeTo, setNewWorkTypeTo] = useState('');
  const [newVarietyFrom, setNewVarietyFrom] = useState('');
  const [newVarietyTo, setNewVarietyTo] = useState('');
  const [applyResult, setApplyResult] = useState<{ modifiedCount: number } | null>(null);

  const handleToggleAliasEnabled = useCallback(() => {
    setAliasSettings(prev => {
      const updated = { ...prev, enabled: !prev.enabled };
      saveAliasSettings(updated);
      return updated;
    });
  }, []);

  const handleApplyPreset = useCallback((presetKey: PresetKey) => {
    const newSettings = applyPreset(presetKey);
    setAliasSettings(newSettings);
  }, []);

  const handleResetAliases = useCallback(() => {
    const newSettings = clearAliasSettings();
    setAliasSettings(newSettings);
  }, []);

  const handleAddWorkTypeAlias = useCallback(() => {
    if (newWorkTypeFrom.trim() && newWorkTypeTo.trim()) {
      setAliasSettings(prev => {
        const updated = {
          ...prev,
          mappings: {
            ...prev.mappings,
            workType: {
              ...prev.mappings.workType,
              [newWorkTypeFrom.trim()]: newWorkTypeTo.trim()
            }
          },
          activePreset: undefined
        };
        saveAliasSettings(updated);
        return updated;
      });
      setNewWorkTypeFrom('');
      setNewWorkTypeTo('');
    }
  }, [newWorkTypeFrom, newWorkTypeTo]);

  const handleAddVarietyAlias = useCallback(() => {
    if (newVarietyFrom.trim() && newVarietyTo.trim()) {
      setAliasSettings(prev => {
        const updated = {
          ...prev,
          mappings: {
            ...prev.mappings,
            variety: {
              ...prev.mappings.variety,
              [newVarietyFrom.trim()]: newVarietyTo.trim()
            }
          },
          activePreset: undefined
        };
        saveAliasSettings(updated);
        return updated;
      });
      setNewVarietyFrom('');
      setNewVarietyTo('');
    }
  }, [newVarietyFrom, newVarietyTo]);

  const handleRemoveWorkTypeAlias = useCallback((key: string) => {
    setAliasSettings(prev => {
      const newWorkType = { ...prev.mappings.workType };
      delete newWorkType[key];
      const updated = {
        ...prev,
        mappings: { ...prev.mappings, workType: newWorkType },
        activePreset: undefined
      };
      saveAliasSettings(updated);
      return updated;
    });
  }, []);

  const handleRemoveVarietyAlias = useCallback((key: string) => {
    setAliasSettings(prev => {
      const newVariety = { ...prev.mappings.variety };
      delete newVariety[key];
      const updated = {
        ...prev,
        mappings: { ...prev.mappings, variety: newVariety },
        activePreset: undefined
      };
      saveAliasSettings(updated);
      return updated;
    });
  }, []);

  const handleApplyToSession = useCallback(() => {
    if (onApplyAliasesToSession) {
      const result = onApplyAliasesToSession();
      setApplyResult(result);
      setTimeout(() => setApplyResult(null), 3000);
    }
  }, [onApplyAliasesToSession]);

  const workTypeAliasEntries = Object.entries(aliasSettings.mappings.workType);
  const varietyAliasEntries = Object.entries(aliasSettings.mappings.variety);
  const hasAnyAliases = workTypeAliasEntries.length > 0 || varietyAliasEntries.length > 0;

  return {
    aliasSettings,
    newWorkTypeFrom,
    setNewWorkTypeFrom,
    newWorkTypeTo,
    setNewWorkTypeTo,
    newVarietyFrom,
    setNewVarietyFrom,
    newVarietyTo,
    setNewVarietyTo,
    applyResult,
    workTypeAliasEntries,
    varietyAliasEntries,
    hasAnyAliases,
    handleToggleAliasEnabled,
    handleApplyPreset,
    handleResetAliases,
    handleAddWorkTypeAlias,
    handleAddVarietyAlias,
    handleRemoveWorkTypeAlias,
    handleRemoveVarietyAlias,
    handleApplyToSession
  };
}
