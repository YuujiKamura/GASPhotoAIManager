import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateZip } from '../utils/zipGenerator';
import { PhotoRecord } from '../types';

const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AH//Z';

const makePhoto = (i: number): PhotoRecord => ({
  fileName: `photo_${i}.jpg`,
  base64: `data:image/jpeg;base64,${TINY_JPEG_B64}`,
  mimeType: 'image/jpeg',
  fileSize: 100,
  lastModified: Date.now(),
  status: 'done' as const,
  analysis: {
    fileName: `photo_${i}.jpg`,
    workType: '土工',
    variety: '掘削',
    detail: '作業',
    station: 'No.1',
    remarks: '',
    description: '',
    hasBoard: false,
    detectedText: '',
  },
});

describe('zipGenerator (bundled JSZip smoke test)', () => {
  it('JSZip default export is callable', () => {
    const zip = new JSZip();
    expect(zip).toBeDefined();
    expect(typeof zip.folder).toBe('function');
    expect(typeof zip.generateAsync).toBe('function');
  });

  it('generateZip returns a non-empty Blob from bundled JSZip', async () => {
    const records = [makePhoto(1), makePhoto(2)];
    const blob = await generateZip(records);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toMatch(/zip|octet-stream/);
  });

  it('JSZip can build and parse a zip via nodebuffer (roundtrip without Blob)', async () => {
    const zip = new JSZip();
    zip.file('a.txt', 'hello');
    zip.folder('sub')!.file('b.txt', 'world');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });

    const parsed = await JSZip.loadAsync(buf);
    expect(parsed.file('a.txt')).not.toBeNull();
    expect(parsed.file('sub/b.txt')).not.toBeNull();
  });
});
