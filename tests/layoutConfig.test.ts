import { describe, it, expect } from 'vitest';
import {
  DIMENSION,
  pxToPt,
  ptToPx,
  pxToExcelWidth,
  excelWidthToPx,
  LAYOUT_FIELDS,
  ROWS_PER_PHOTO
} from '../utils/layoutConfig';

describe('DIMENSION constants', () => {
  it('has correct row height values', () => {
    // SCALE=1.1, PHOTO_HEIGHT_PT/10 * 1.1 ≈ 26pt
    expect(DIMENSION.ROW_HEIGHT_PT).toBe(26);
    // 26pt * 1.333 ≈ 35px
    expect(DIMENSION.ROW_HEIGHT_PX).toBe(35);
  });

  it('has correct conversion factors', () => {
    expect(DIMENSION.PX_TO_PT).toBeCloseTo(0.75, 2);
    expect(DIMENSION.PT_TO_PX).toBeCloseTo(1.333, 2);
  });
});

describe('conversion functions', () => {
  it('pxToPt converts pixels to points', () => {
    expect(pxToPt(96)).toBe(72);  // 96px = 72pt
    expect(pxToPt(35)).toBe(26);  // row height (35px → 26pt)
  });

  it('ptToPx converts points to pixels', () => {
    expect(ptToPx(72)).toBe(96);  // 72pt = 96px
    expect(ptToPx(26)).toBe(35);  // row height (26pt → 35px)
  });

  it('pxToExcelWidth converts pixels to Excel width units', () => {
    // (48 - 5) / 7.1 ≈ 6
    expect(pxToExcelWidth(48)).toBe(6);
  });

  it('excelWidthToPx converts Excel width to pixels', () => {
    // 8 * 7.1 + 5 ≈ 62
    expect(excelWidthToPx(8)).toBe(62);
  });
});

describe('LAYOUT_FIELDS', () => {
  it('has 8 fields defined', () => {
    // date, photoCategory, workType, variety, detail, station, remarks, measurements
    expect(LAYOUT_FIELDS).toHaveLength(8);
  });

  it('includes required fields', () => {
    const keys = LAYOUT_FIELDS.map(f => f.key);
    expect(keys).toContain('date');
    expect(keys).toContain('workType');
    expect(keys).toContain('remarks');
    expect(keys).toContain('station');
  });

  it('has valid rowSpan values', () => {
    for (const field of LAYOUT_FIELDS) {
      expect(field.rowSpan).toBeGreaterThan(0);
    }
  });

  it('total rowSpan is within ROWS_PER_PHOTO', () => {
    // date(1) + photoCategory(1) + workType(1) + variety(1) + detail(1) + station(1) + remarks(2) + measurements(2) = 10
    const totalSpan = LAYOUT_FIELDS.reduce((sum, f) => sum + f.rowSpan, 0);
    // The total span should be less than or equal to ROWS_PER_PHOTO (11)
    expect(totalSpan).toBeLessThanOrEqual(ROWS_PER_PHOTO);
  });
});

describe('ROWS_PER_PHOTO', () => {
  it('is 11 for 3-up A4 layout (10 photo rows + 1 gap row)', () => {
    expect(ROWS_PER_PHOTO).toBe(11);
  });
});
