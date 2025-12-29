import { useCallback } from 'react';
import { PhotoRecord, ProcessingStats } from '../types';
import { clearAnalysisCache } from '../utils/storage';
import { fsCache } from '../utils/fileSystemCache';

interface UseCacheHandlersProps {
  lang: 'ja' | 'en';
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  setStats: React.Dispatch<React.SetStateAction<ProcessingStats>>;
  setErrorMsg: (msg: string | null) => void;
  setSuccessMsg: (msg: string | null) => void;
  fsCacheEnabled: boolean;
  setFsCacheEnabled: (enabled: boolean) => void;
  setFsCacheStats: (stats: { count: number; size: number }) => void;
}

/**
 * キャッシュ管理関連のカスタムフック
 */
export function useCacheHandlers({
  lang,
  setPhotos,
  setStats,
  setErrorMsg,
  setSuccessMsg,
  fsCacheEnabled,
  setFsCacheEnabled,
  setFsCacheStats,
}: UseCacheHandlersProps) {
  // 解析キャッシュをクリア
  const handleClearCache = useCallback(async () => {
    const msg = lang === 'ja' ? "解析済みのキャッシュデータを削除しますか？" : "Clear analysis cache?";
    if (window.confirm(msg)) {
      await clearAnalysisCache();
      setStats(prev => ({ ...prev, cached: 0 }));
      setPhotos(prev => prev.map(p => ({ ...p, fromCache: false })));
      alert(lang === 'ja' ? "キャッシュを削除しました。" : "Cache cleared.");
    }
  }, [lang, setStats, setPhotos]);

  // ファイルシステムキャッシュフォルダを選択
  const handleSelectCacheFolder = useCallback(async () => {
    if (!fsCache.isAvailable()) {
      setErrorMsg("File System Access API is not supported.");
      return;
    }
    try {
      const selected = await fsCache.selectDirectory();
      if (selected) {
        setFsCacheEnabled(true);
        await fsCache.saveHandle();
        setFsCacheStats(fsCache.getStats());
        setSuccessMsg("Cache folder selected!");
      }
    } catch (error) {
      setErrorMsg("Failed to select cache folder.");
    }
  }, [setErrorMsg, setSuccessMsg, setFsCacheEnabled, setFsCacheStats]);

  // ファイルシステムキャッシュをクリア
  const handleClearFileSystemCache = useCallback(async () => {
    if (!fsCacheEnabled) return;
    if (window.confirm("Clear file system cache?")) {
      await fsCache.clearCache();
      setFsCacheStats(fsCache.getStats());
      setSuccessMsg("File system cache cleared!");
    }
  }, [fsCacheEnabled, setFsCacheStats, setSuccessMsg]);

  return {
    handleClearCache,
    handleSelectCacheFolder,
    handleClearFileSystemCache,
  };
}
