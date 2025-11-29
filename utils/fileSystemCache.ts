/**
 * File System Access API を使用したローカルファイルキャッシュ
 * ブラウザから直接ローカルファイルシステムにアクセスして永続化
 */

import { PhotoRecord, AIAnalysisResult } from '../types';

// キャッシュファイル名の規則
const CACHE_FILE_PREFIX = 'photo_cache_';
const CACHE_INDEX_FILE = '.cache_index.json';

export interface CacheIndex {
  version: string;
  lastUpdated: string;
  files: {
    [key: string]: {
      fileName: string;
      hash: string;
      cachedAt: string;
    };
  };
}

export interface CacheEntry {
  photoHash: string;
  fileName: string;
  analysis: AIAnalysisResult;
  cachedAt: string;
}

// ファイルハッシュを生成（簡易版）
const generateHash = async (base64: string): Promise<string> => {
  // base64の最初の1000文字 + サイズでハッシュ生成
  const sample = base64.substring(0, 1000) + base64.length;
  const encoder = new TextEncoder();
  const data = encoder.encode(sample);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 16); // 16文字に短縮
};

class FileSystemCache {
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private cacheIndex: CacheIndex | null = null;

  /**
   * キャッシュディレクトリを選択または作成
   */
  async selectCacheDirectory(): Promise<boolean> {
    try {
      // @ts-ignore - File System Access APIは型定義が不完全
      this.directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });

      await this.loadOrCreateIndex();
      return true;
    } catch (error) {
      console.error('Failed to select cache directory:', error);
      return false;
    }
  }

  /**
   * 既存のハンドルから復元（ページリロード時用）
   */
  async restoreFromHandle(handle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
      // 権限を再確認
      // @ts-ignore
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        this.directoryHandle = handle;
        await this.loadOrCreateIndex();
        return true;
      }

      // 権限を再要求
      // @ts-ignore
      const requestPermission = await handle.requestPermission({ mode: 'readwrite' });
      if (requestPermission === 'granted') {
        this.directoryHandle = handle;
        await this.loadOrCreateIndex();
        return true;
      }
    } catch (error) {
      console.error('Failed to restore directory handle:', error);
    }
    return false;
  }

  /**
   * インデックスファイルの読み込みまたは作成
   */
  private async loadOrCreateIndex(): Promise<void> {
    if (!this.directoryHandle) return;

    try {
      const fileHandle = await this.directoryHandle.getFileHandle(CACHE_INDEX_FILE);
      const file = await fileHandle.getFile();
      const text = await file.text();
      this.cacheIndex = JSON.parse(text);
    } catch {
      // インデックスファイルが存在しない場合は新規作成
      this.cacheIndex = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        files: {}
      };
      await this.saveIndex();
    }
  }

  /**
   * インデックスファイルの保存
   */
  private async saveIndex(): Promise<void> {
    if (!this.directoryHandle || !this.cacheIndex) return;

    try {
      const fileHandle = await this.directoryHandle.getFileHandle(
        CACHE_INDEX_FILE,
        { create: true }
      );
      // @ts-ignore
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(this.cacheIndex, null, 2));
      await writable.close();
    } catch (error) {
      console.error('Failed to save cache index:', error);
    }
  }

  /**
   * 写真の解析結果をキャッシュ
   */
  async cacheAnalysis(photo: PhotoRecord, analysis: AIAnalysisResult): Promise<void> {
    if (!this.directoryHandle || !this.cacheIndex) return;

    try {
      const hash = await generateHash(photo.base64);
      const cacheFileName = `${CACHE_FILE_PREFIX}${hash}.json`;

      const entry: CacheEntry = {
        photoHash: hash,
        fileName: photo.fileName,
        analysis,
        cachedAt: new Date().toISOString()
      };

      // キャッシュファイルを保存
      const fileHandle = await this.directoryHandle.getFileHandle(
        cacheFileName,
        { create: true }
      );
      // @ts-ignore
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(entry, null, 2));
      await writable.close();

      // インデックスを更新
      this.cacheIndex.files[hash] = {
        fileName: photo.fileName,
        hash,
        cachedAt: entry.cachedAt
      };
      this.cacheIndex.lastUpdated = new Date().toISOString();
      await this.saveIndex();

      console.log(`Cached analysis for ${photo.fileName}`);
    } catch (error) {
      console.error('Failed to cache analysis:', error);
    }
  }

  /**
   * キャッシュから解析結果を取得
   */
  async getCachedAnalysis(photo: PhotoRecord): Promise<AIAnalysisResult | null> {
    if (!this.directoryHandle || !this.cacheIndex) return null;

    try {
      const hash = await generateHash(photo.base64);

      // インデックスにエントリが存在するか確認
      if (!this.cacheIndex.files[hash]) {
        return null;
      }

      const cacheFileName = `${CACHE_FILE_PREFIX}${hash}.json`;

      // キャッシュファイルを読み込み
      const fileHandle = await this.directoryHandle.getFileHandle(cacheFileName);
      const file = await fileHandle.getFile();
      const text = await file.text();
      const entry: CacheEntry = JSON.parse(text);

      console.log(`Retrieved cached analysis for ${photo.fileName}`);
      return entry.analysis;
    } catch (error) {
      console.error('Failed to retrieve cached analysis:', error);
      return null;
    }
  }

  /**
   * すべてのキャッシュをクリア
   */
  async clearAllCache(): Promise<void> {
    if (!this.directoryHandle || !this.cacheIndex) return;

    try {
      // すべてのキャッシュファイルを削除
      for (const hash of Object.keys(this.cacheIndex.files)) {
        const cacheFileName = `${CACHE_FILE_PREFIX}${hash}.json`;
        try {
          await this.directoryHandle.removeEntry(cacheFileName);
        } catch {
          // ファイルが存在しない場合は無視
        }
      }

      // インデックスをリセット
      this.cacheIndex.files = {};
      this.cacheIndex.lastUpdated = new Date().toISOString();
      await this.saveIndex();

      console.log('All cache cleared');
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  /**
   * キャッシュ統計を取得
   */
  getCacheStats(): { totalFiles: number; lastUpdated: string } | null {
    if (!this.cacheIndex) return null;

    return {
      totalFiles: Object.keys(this.cacheIndex.files).length,
      lastUpdated: this.cacheIndex.lastUpdated
    };
  }

  /**
   * ディレクトリハンドルを保存（セッション間で永続化）
   */
  async saveHandleToIndexedDB(): Promise<void> {
    if (!this.directoryHandle) return;

    try {
      const db = await this.openHandleDB();
      const tx = db.transaction(['handles'], 'readwrite');
      const store = tx.objectStore('handles');
      await store.put(this.directoryHandle, 'cacheDirectory');
      console.log('Directory handle saved to IndexedDB');
    } catch (error) {
      console.error('Failed to save handle:', error);
    }
  }

  /**
   * ディレクトリハンドルを復元
   */
  async loadHandleFromIndexedDB(): Promise<boolean> {
    try {
      const db = await this.openHandleDB();
      const tx = db.transaction(['handles'], 'readonly');
      const store = tx.objectStore('handles');
      const request = store.get('cacheDirectory');

      return new Promise((resolve) => {
        request.onsuccess = async () => {
          const handle = request.result;
          if (handle) {
            const restored = await this.restoreFromHandle(handle);
            resolve(restored);
          } else {
            resolve(false);
          }
        };
        request.onerror = () => resolve(false);
      });
    } catch (error) {
      console.error('Failed to load handle:', error);
      return false;
    }
  }

  /**
   * ハンドル保存用のIndexedDBを開く
   */
  private openHandleDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('FileSystemHandles', 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles');
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * File System Access APIがサポートされているか確認
   */
  static isSupported(): boolean {
    // @ts-ignore
    return 'showDirectoryPicker' in window;
  }
}

// シングルトンインスタンス
export const fileSystemCache = new FileSystemCache();

// 既存のstorage.tsと互換性のあるインターフェース
export const fsCache = {
  isAvailable: FileSystemCache.isSupported,

  selectDirectory: async (): Promise<boolean> => {
    return await fileSystemCache.selectCacheDirectory();
  },

  cacheAnalysis: async (photo: PhotoRecord, analysis: AIAnalysisResult): Promise<void> => {
    await fileSystemCache.cacheAnalysis(photo, analysis);
  },

  getCachedAnalysis: async (photo: PhotoRecord): Promise<AIAnalysisResult | null> => {
    return await fileSystemCache.getCachedAnalysis(photo);
  },

  clearCache: async (): Promise<void> => {
    await fileSystemCache.clearAllCache();
  },

  getStats: () => {
    return fileSystemCache.getCacheStats();
  },

  saveHandle: async (): Promise<void> => {
    await fileSystemCache.saveHandleToIndexedDB();
  },

  restoreHandle: async (): Promise<boolean> => {
    return await fileSystemCache.loadHandleFromIndexedDB();
  }
};