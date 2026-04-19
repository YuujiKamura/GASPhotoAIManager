import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

describe('bundled npm imports (smoke tests for PR #182 migration)', () => {
  it('ExcelJS default export constructs a Workbook', () => {
    const workbook = new ExcelJS.Workbook();
    expect(workbook).toBeDefined();
    expect(typeof workbook.addWorksheet).toBe('function');

    const sheet = workbook.addWorksheet('Test');
    sheet.addRow(['a', 'b', 'c']);
    expect(sheet.rowCount).toBe(1);
  });

  it('ExcelJS Workbook serializes to a buffer', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('S');
    sheet.addRow([1, 2, 3]);
    const buf = await wb.xlsx.writeBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it('file-saver named export saveAs is a function', () => {
    expect(typeof saveAs).toBe('function');
  });
});
