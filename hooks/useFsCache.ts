import { useState, useEffect, useCallback } from 'react';
import { fsCache } from '../utils/fileSystemCache';

interface FsCacheStats {
  totalFiles: number;
  lastUpdated: string;
}

/**
 * ファイルシステムキャッシュ管理のカスタムフック
 */
export function useFsCache(addLog?: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void) {
  const [fsCacheEnabled, setFsCacheEnabled] = useState(false);
  const [fsCacheStats, setFsCacheStats] = useState<FsCacheStats | null>(null);

  // 初期化時にキャッシュを復元
  useEffect(() => {
    const restoreCache = async () => {
      if (fsCache.isAvailable()) {
        const restored = await fsCache.restoreHandle();
        if (restored) {
          setFsCacheEnabled(true);
          const stats = fsCache.getStats();
          setFsCacheStats(stats);
          addLog?.("File system cache restored from previous session.", 'success');
        }
      }
    };
    restoreCache();
  }, [addLog]);

  // キャッシュを有効化
  const enableCache = useCallback(async () => {
    if (fsCache.isAvailable()) {
      // This would trigger file picker - actual implementation depends on fsCache API
      setFsCacheEnabled(true);
      const stats = fsCache.getStats();
      setFsCacheStats(stats);
    }
  }, []);

  // キャッシュを無効化
  const disableCache = useCallback(() => {
    setFsCacheEnabled(false);
    setFsCacheStats(null);
  }, []);

  // 統計を更新
  const refreshStats = useCallback(() => {
    if (fsCacheEnabled) {
      const stats = fsCache.getStats();
      setFsCacheStats(stats);
    }
  }, [fsCacheEnabled]);

  return {
    fsCacheEnabled,
    setFsCacheEnabled,
    fsCacheStats,
    setFsCacheStats,
    enableCache,
    disableCache,
    refreshStats,
  };
}
