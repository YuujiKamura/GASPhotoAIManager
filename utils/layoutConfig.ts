
import { AIAnalysisResult } from "../types";

export interface FieldDefinition {
  id: string; // Unique ID for key mapping
  key: keyof AIAnalysisResult | 'date'; // Data key
  labelKey: string; // Translation key in TRANS
  rowSpan: number; // Height weight (1 unit approx 28px)
  heightClass: string; // Tailwind class for Web View
  multiline: boolean; // Textarea vs Input
  readOnly?: boolean;
}

/**
 * SHARED LAYOUT DEFINITION
 * Total Rows: 12 (Standard block size for 3-up on A4)
 * Base Row Height: ~28px (21pt in Excel)
 */
export const LAYOUT_FIELDS: FieldDefinition[] = [
  { 
    id: 'f_date',
    key: 'date', 
    labelKey: 'labelDate', 
    rowSpan: 1, 
    heightClass: 'h-[28px]', 
    multiline: false,
    readOnly: true
  },
  { 
    id: 'f_workType',
    key: 'workType', 
    labelKey: 'labelWorkType', 
    rowSpan: 1, 
    heightClass: 'h-[28px]', 
    multiline: false 
  },
  { 
    id: 'f_variety',
    key: 'variety', 
    labelKey: 'labelVariety', 
    rowSpan: 1, 
    heightClass: 'h-[28px]', 
    multiline: false 
  },
  { 
    id: 'f_detail',
    key: 'detail', 
    labelKey: 'labelDetail', 
    rowSpan: 1, 
    heightClass: 'h-[28px]', 
    multiline: false 
  },
  { 
    id: 'f_station',
    key: 'station', 
    labelKey: 'labelStation', 
    rowSpan: 1, 
    heightClass: 'h-[28px]', 
    multiline: false 
  },
  { 
    id: 'f_remarks',
    key: 'remarks', 
    labelKey: 'labelRemarks', 
    rowSpan: 2, 
    heightClass: 'h-[56px]', // 2 rows * 28px = 56px
    multiline: true 
  },
  { 
    id: 'f_description',
    key: 'description', 
    labelKey: 'labelDescription', 
    rowSpan: 5, 
    heightClass: 'flex-1', // Takes remaining space (approx 140px)
    multiline: true 
  }
];

export const ROWS_PER_PHOTO = 12;
