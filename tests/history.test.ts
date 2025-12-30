import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock IndexedDB
const mockStore: Record<string, any> = {};

const mockIDBRequest = (result: any) => ({
  result,
  onsuccess: null as any,
  onerror: null as any,
});

const mockTransaction = {
  objectStore: vi.fn(() => ({
    put: vi.fn((entry) => {
      const req = mockIDBRequest(undefined);
      mockStore[entry.id] = entry;
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    }),
    add: vi.fn((entry) => {
      const req = mockIDBRequest(undefined);
      mockStore[entry.id] = entry;
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    }),
    getAll: vi.fn(() => {
      const req = mockIDBRequest(Object.values(mockStore));
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    }),
    get: vi.fn((id) => {
      const req = mockIDBRequest(mockStore[id]);
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    }),
    delete: vi.fn((id) => {
      const req = mockIDBRequest(undefined);
      delete mockStore[id];
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    }),
  })),
};

vi.mock('../utils/storage/dbCore', () => ({
  openDB: vi.fn(() => Promise.resolve({
    transaction: vi.fn(() => mockTransaction),
  })),
  STORE_HISTORY: 'analysisHistory',
  MAX_HISTORY_ENTRIES: 20,
}));

vi.mock('../utils/storage/analysisCache', () => ({
  generateSessionKey: vi.fn((photos) =>
    photos.map((p: any) => p.fileName).sort().join('|')
  ),
  getFileKey: vi.fn((p) => p.fileName),
}));

import { saveAnalysisHistory, getAnalysisHistory } from '../utils/storage/history';
import { PhotoRecord } from '../types';

describe('履歴機能', () => {
  beforeEach(() => {
    // Clear mock store
    Object.keys(mockStore).forEach(key => delete mockStore[key]);
  });

  const createMockPhotos = (count: number): PhotoRecord[] => {
    return Array.from({ length: count }, (_, i) => ({
      fileName: `photo_${i + 1}.jpg`,
      base64: `data:image/jpeg;base64,test${i}`,
      mimeType: 'image/jpeg',
      fileSize: 1000,
      lastModified: Date.now(),
      status: 'done' as const,
      analysis: {
        fileName: `photo_${i + 1}.jpg`,
        workType: '土工',
        variety: '掘削',
        detail: `作業${i + 1}`,
        station: 'No.1',
        remarks: '',
        description: '',
        hasBoard: false,
        detectedText: '',
      },
    }));
  };

  describe('saveAnalysisHistory', () => {
    it('新規セッションを保存できる', async () => {
      const photos = createMockPhotos(3);
      const entry = await saveAnalysisHistory(photos, 'AI解析', 'gemini-pro');

      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.sessionKey).toBe('photo_1.jpg|photo_2.jpg|photo_3.jpg');
      expect(entry.photoCount).toBe(3);
      expect(entry.instruction).toBe('AI解析');
      expect(entry.modelUsed).toBe('gemini-pro');
      expect(entry.createdAt).toBeDefined();
    });

    it('同じsessionKeyの場合は更新される', async () => {
      const photos = createMockPhotos(3);

      // 1回目の保存
      const entry1 = await saveAnalysisHistory(photos, 'AI解析', 'gemini-pro');
      const originalId = entry1.id;
      const originalCreatedAt = entry1.createdAt;

      // 2回目の保存（同じ写真セット）
      const entry2 = await saveAnalysisHistory(photos, '並べ替え', 'pdf-restore');

      // IDとcreatedAtは維持される
      expect(entry2.id).toBe(originalId);
      expect(entry2.createdAt).toBe(originalCreatedAt);
      // instructionは更新される（空でなければ）
      expect(entry2.instruction).toBe('並べ替え');
      // updatedAtが設定される
      expect(entry2.updatedAt).toBeDefined();
    });

    it('異なるsessionKeyの場合は新規エントリになる', async () => {
      const photos1 = createMockPhotos(3);
      const photos2 = createMockPhotos(5); // 異なる写真セット

      const entry1 = await saveAnalysisHistory(photos1, 'セット1');
      const entry2 = await saveAnalysisHistory(photos2, 'セット2');

      expect(entry1.id).not.toBe(entry2.id);
      expect(entry1.sessionKey).not.toBe(entry2.sessionKey);
    });
  });

  describe('履歴の追跡', () => {
    it('PDFアップロード→並べ替えで同一エントリが更新される', async () => {
      const photos = createMockPhotos(3);

      // PDFアップロード時
      const entry1 = await saveAnalysisHistory(photos, 'PDF復元: test.pdf', 'pdf-restore');

      // 並べ替え時
      const entry2 = await saveAnalysisHistory(photos, '並べ替え');

      // 同じエントリが更新される
      expect(entry2.id).toBe(entry1.id);
      expect(entry2.updatedAt).toBeGreaterThanOrEqual(entry1.createdAt);
    });
  });
});
