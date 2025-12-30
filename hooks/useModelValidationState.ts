import { useState, useCallback } from 'react';
import {
  validateAllModels,
  AVAILABLE_MODELS,
  ModelType,
  ModelStatus,
  ModelAvailability,
  getSelectedModel,
  setSelectedModel,
  getBestAvailableModel,
  setTrustedSession
} from '../services/geminiService';

interface ModelValidationState {
  selectedModel: ModelType;
  isValidating: boolean;
  modelAvailabilities: ModelAvailability[];
  keyError: string | null;
  trustSession: boolean;
  hasAnyAvailable: boolean;
}

interface ModelValidationActions {
  setTrustSession: (value: boolean) => void;
  validateModels: (apiKey: string) => Promise<void>;
  handleModelChange: (model: ModelType) => void;
  handleSubmit: (apiKey: string, onComplete: (key: string) => void, registerBiometricCallback?: () => Promise<void>) => Promise<void>;
  getStatusIcon: (status: ModelStatus) => 'available' | 'quota_exceeded' | 'unavailable' | 'checking' | 'error';
  getStatusText: (status: ModelStatus, error?: string) => string;
}

export function useModelValidationState(): ModelValidationState & ModelValidationActions {
  const [selectedModel, setSelectedModelState] = useState<ModelType>(getSelectedModel());
  const [isValidating, setIsValidating] = useState(false);
  const [modelAvailabilities, setModelAvailabilities] = useState<ModelAvailability[]>([]);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [trustSession, setTrustSession] = useState(true);

  const hasAnyAvailable = modelAvailabilities.some(m => m.status === 'available');

  const validateModels = useCallback(async (apiKey: string) => {
    setIsValidating(true);
    setKeyError(null);
    setModelAvailabilities(AVAILABLE_MODELS.map(m => ({ ...m, status: 'checking' as ModelStatus })));

    const results = await validateAllModels(apiKey, (modelId, status, error) => {
      setModelAvailabilities(prev =>
        prev.map(m => m.id === modelId ? { ...m, status, error } : m)
      );
    });

    setModelAvailabilities(results);
    setIsValidating(false);

    const allInvalid = results.every(r => r.error?.includes('無効'));
    if (allInvalid) {
      setKeyError('APIキーが無効です');
    }

    const bestModel = getBestAvailableModel(results);
    if (bestModel) {
      setSelectedModelState(bestModel);
    }
  }, []);

  const handleModelChange = useCallback((model: ModelType) => {
    const availability = modelAvailabilities.find(m => m.id === model);
    if (availability?.status === 'available') {
      setSelectedModelState(model);
    }
  }, [modelAvailabilities]);

  const handleSubmit = useCallback(async (
    apiKey: string,
    onComplete: (key: string) => void,
    registerBiometricCallback?: () => Promise<void>
  ) => {
    const selectedAvailability = modelAvailabilities.find(m => m.id === selectedModel);

    if (!selectedAvailability || selectedAvailability.status !== 'available') {
      const bestModel = getBestAvailableModel(modelAvailabilities);
      if (bestModel) {
        setSelectedModel(bestModel);
      } else {
        return;
      }
    } else {
      setSelectedModel(selectedModel);
    }

    if (registerBiometricCallback) {
      await registerBiometricCallback();
    }

    setTrustedSession(trustSession);
    onComplete(apiKey);
  }, [modelAvailabilities, selectedModel, trustSession]);

  const getStatusIcon = useCallback((status: ModelStatus): 'available' | 'quota_exceeded' | 'unavailable' | 'checking' | 'error' => {
    switch (status) {
      case 'available':
        return 'available';
      case 'quota_exceeded':
        return 'quota_exceeded';
      case 'unavailable':
        return 'unavailable';
      case 'checking':
        return 'checking';
      default:
        return 'error';
    }
  }, []);

  const getStatusText = useCallback((status: ModelStatus, error?: string): string => {
    switch (status) {
      case 'available':
        return '利用可能';
      case 'quota_exceeded':
        return '制限超過';
      case 'unavailable':
        return error || '利用不可';
      case 'checking':
        return '確認中...';
      default:
        return error || 'エラー';
    }
  }, []);

  return {
    selectedModel,
    isValidating,
    modelAvailabilities,
    keyError,
    trustSession,
    hasAnyAvailable,
    setTrustSession,
    validateModels,
    handleModelChange,
    handleSubmit,
    getStatusIcon,
    getStatusText,
  };
}
