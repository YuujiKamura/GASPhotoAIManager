import { useState, useEffect, useCallback } from 'react';
import {
  isBiometricAvailable, hasRegisteredPasskey, registerPasskey,
  authenticateWithPasskey, removePasskey
} from '../services/webAuthnService';
import { setTrustedSession } from '../services/geminiService';

export function useBiometricAuth() {
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [registerBiometric, setRegisterBiometric] = useState(true);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  useEffect(() => {
    const checkBiometric = async () => {
      const available = await isBiometricAvailable();
      setBiometricSupported(available);
      if (available) {
        setHasPasskey(hasRegisteredPasskey());
      }
    };
    checkBiometric();
  }, []);

  const handleBiometricLogin = useCallback(async (onComplete: (apiKey: string) => void) => {
    setIsAuthenticating(true);
    setBiometricError(null);

    const result = await authenticateWithPasskey();

    if (result.success && result.apiKey) {
      setTrustedSession(true);
      onComplete(result.apiKey);
    } else {
      setBiometricError(result.error || '認証に失敗しました');
    }

    setIsAuthenticating(false);
  }, []);

  const handleRemovePasskey = useCallback(() => {
    if (confirm('登録済みの生体認証を削除しますか？')) {
      removePasskey();
      setHasPasskey(false);
    }
  }, []);

  const handleRegisterPasskey = useCallback(async (apiKey: string) => {
    const result = await registerPasskey(apiKey);
    if (result.success) {
      setHasPasskey(true);
    }
    return result;
  }, []);

  return {
    state: {
      biometricSupported,
      hasPasskey,
      isAuthenticating,
      registerBiometric,
      biometricError,
    },
    actions: {
      setRegisterBiometric,
      handleBiometricLogin,
      handleRemovePasskey,
      handleRegisterPasskey,
    },
  };
}
