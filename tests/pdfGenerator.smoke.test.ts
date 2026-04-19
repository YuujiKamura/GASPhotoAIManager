import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

describe('pdf-lib smoke tests (ensures ESM/CJS resolution stays healthy)', () => {
  it('pdf-lib named exports are available', () => {
    expect(typeof PDFDocument.create).toBe('function');
    expect(StandardFonts.Helvetica).toBeTruthy();
    expect(typeof rgb).toBe('function');
  });

  it('fontkit default export is registrable on a PDFDocument', async () => {
    const doc = await PDFDocument.create();
    expect(() => doc.registerFontkit(fontkit)).not.toThrow();
  });

  it('PDFDocument builds a minimal PDF and roundtrips via load()', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([200, 100]);
    page.drawText('Smoke OK', { x: 20, y: 40, size: 18, font, color: rgb(0, 0, 0) });

    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(100);

    // PDF magic header "%PDF-"
    expect(bytes[0]).toBe(0x25);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x44);
    expect(bytes[3]).toBe(0x46);

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });
});
