import { useState, useCallback } from 'react';
import {
  validateAllModels, AVAILABLE_MODELS, ModelType, ModelStatus, ModelAvailability,
  getSelectedModel, setSelectedModel, getBestAvailableModel, setTrustedSession
} from '../services/geminiService';

export function useModelValidation(apiKey: string) {
  const [selectedModel, setSelectedModelState] = useState<ModelType>(getSelectedModel());
  const [isValidating, setIsValidating] = useState(false);
  const [modelAvailabilities, setModelAvailabilities] = useState<ModelAvailability[]>([]);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [trustSession, setTrustSession] = useState(true);

  const validateModels = useCallback(async () => {
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
  }, [apiKey]);

  const handleModelChange = useCallback((model: ModelType) => {
    const availability = modelAvailabilities.find(m => m.id === model);
    if (availability?.status === 'available') {
      setSelectedModelState(model);
    }
  }, [modelAvailabilities]);

  const handleSubmit = useCallback(async (registerBiometric: boolean, hasPasskey: boolean, registerPasskeyFn: (apiKey: string) => Promise<{success: boolean}>, onComplete: (apiKey: string) => void) => {
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

    // 生体認証を登録する場合
    if (registerBiometric && !hasPasskey) {
      const result = await registerPasskeyFn(apiKey);
      if (!result.success) {
        console.warn('Passkey registration failed');
      }
    }

    setTrustedSession(trustSession);
    onComplete(apiKey);
  }, [modelAvailabilities, selectedModel, trustSession, apiKey]);

  const hasAnyAvailable = modelAvailabilities.some(m => m.status === 'available');

  return {
    state: {
      selectedModel,
      isValidating,
      modelAvailabilities,
      keyError,
      trustSession,
      hasAnyAvailable,
    },
    actions: {
      validateModels,
      handleModelChange,
      handleSubmit,
      setTrustSession,
    },
  };
}
