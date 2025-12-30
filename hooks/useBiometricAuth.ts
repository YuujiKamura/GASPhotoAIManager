import { useState, useEffect, useCallback } from 'react';
import { setTrustedSession } from '../services/geminiService';
import {
  isBiometricAvailable,
  hasRegisteredPasskey,
  registerPasskey,
  authenticateWithPasskey,
  removePasskey
} from '../services/webAuthnService';

interface BiometricAuthState {
  biometricSupported: boolean;
  hasPasskey: boolean;
  isAuthenticating: boolean;
  registerBiometric: boolean;
  biometricError: string | null;
}

interface BiometricAuthActions {
  setRegisterBiometric: (value: boolean) => void;
  handleBiometricLogin: (onComplete: (apiKey: string) => void) => Promise<void>;
  handleRemovePasskey: () => void;
  handleRegisterPasskey: (apiKey: string) => Promise<void>;
}

export function useBiometricAuth(): BiometricAuthState & BiometricAuthActions {
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [registerBiometric, setRegisterBiometric] = useState(true);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  // 生体認証の可否をチェック
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

  // 生体認証でログイン
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

  // パスキーを削除
  const handleRemovePasskey = useCallback(() => {
    if (confirm('登録済みの生体認証を削除しますか？')) {
      removePasskey();
      setHasPasskey(false);
    }
  }, []);

  // パスキーを登録
  const handleRegisterPasskey = useCallback(async (apiKey: string) => {
    if (biometricSupported && registerBiometric && !hasPasskey) {
      const result = await registerPasskey(apiKey);
      if (result.success) {
        setHasPasskey(true);
      } else {
        console.warn('Passkey registration failed:', result.error);
      }
    }
  }, [biometricSupported, registerBiometric, hasPasskey]);

  return {
    biometricSupported,
    hasPasskey,
    isAuthenticating,
    registerBiometric,
    biometricError,
    setRegisterBiometric,
    handleBiometricLogin,
    handleRemovePasskey,
    handleRegisterPasskey,
  };
}
