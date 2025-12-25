/**
 * EXIF取得モジュール（Node.js / Browser 両対応）
 * 
 * Node.js環境: exifrを使用（ファイルパスから読み込み）
 * Browser環境: exif-jsを使用（Fileオブジェクトから読み込み）
 */

// Node.js用: exifrをdynamic importで使用
let exifrModule: typeof import('exifr') | null = null;

/**
 * Node.js環境かどうかを判定
 */
export function isNodeEnvironment(): boolean {
  return typeof process !== 'undefined' && process.versions && !!process.versions.node;
}

/**
 * Browser環境かどうかを判定
 */
export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * EXIFから撮影日時を取得（Node.js用 - ファイルパスから）
 */
export async function getExifDateFromPath(filePath: string): Promise<Date | null> {
  if (!isNodeEnvironment()) {
    console.warn('[EXIF] getExifDateFromPath is only available in Node.js environment');
    return null;
  }

  try {
    // Dynamic import for exifr (Node.js only)
    if (!exifrModule) {
      exifrModule = await import('exifr');
    }
    
    const exif = await exifrModule.parse(filePath, { 
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] 
    });
    
    if (exif?.DateTimeOriginal) return new Date(exif.DateTimeOriginal);
    if (exif?.CreateDate) return new Date(exif.CreateDate);
    if (exif?.ModifyDate) return new Date(exif.ModifyDate);
    return null;
  } catch {
    return null;
  }
}

/**
 * EXIFから撮影日時を取得（Browser用 - Fileオブジェクトから）
 * 
 * 注意: この関数はブラウザ環境でのみ動作します。
 * index.htmlでexif-jsをCDNから読み込む必要があります:
 * <script src="https://cdn.jsdelivr.net/npm/exif-js"></script>
 */
export function getExifDateFromFile(file: File): Promise<Date | null> {
  return new Promise((resolve) => {
    if (!isBrowserEnvironment()) {
      console.warn('[EXIF] getExifDateFromFile is only available in Browser environment');
      resolve(null);
      return;
    }

    // Default to lastModified if EXIF fails
    const defaultDate = new Date(file.lastModified);

    // Check if EXIF global is available (from exif-js CDN)
    const EXIF = (window as any).EXIF;
    if (typeof EXIF === 'undefined') {
      resolve(defaultDate);
      return;
    }

    EXIF.getData(file, function(this: any) {
      const dateStr = EXIF.getTag(this, "DateTimeOriginal");
      if (dateStr) {
        // Format is usually "YYYY:MM:DD HH:MM:SS"
        try {
          const [datePart, timePart] = dateStr.split(' ');
          const [y, m, d] = datePart.split(':');
          const [h, min, s] = timePart.split(':');
          const dateObj = new Date(
            parseInt(y), 
            parseInt(m) - 1, 
            parseInt(d), 
            parseInt(h), 
            parseInt(min), 
            parseInt(s)
          );
          resolve(dateObj);
        } catch {
          resolve(defaultDate);
        }
      } else {
        resolve(defaultDate);
      }
    });
  });
}

/**
 * 撮影日時をフォーマット（例: "11/27"）
 */
export function formatExifDate(date: Date, format: 'M/D' | 'M月D日' | 'YYYY/MM/DD' = 'M/D'): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();

  switch (format) {
    case 'M/D':
      return `${month}/${day}`;
    case 'M月D日':
      return `${month}月${day}日`;
    case 'YYYY/MM/DD':
      return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    default:
      return `${month}/${day}`;
  }
}

/**
 * 複数ファイルからEXIF日付を取得し、最頻値を返す（Node.js用）
 */
export async function getMostFrequentExifDate(
  filePaths: string[],
  format: 'M/D' | 'M月D日' | 'YYYY/MM/DD' = 'M/D'
): Promise<string | null> {
  if (!isNodeEnvironment()) {
    console.warn('[EXIF] getMostFrequentExifDate is only available in Node.js environment');
    return null;
  }

  const dateMap = new Map<string, number>();
  
  for (const filePath of filePaths) {
    const exifDate = await getExifDateFromPath(filePath);
    if (exifDate) {
      const dateStr = formatExifDate(exifDate, format);
      dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
    }
  }

  // 最頻値を取得
  let mostFrequent: string | null = null;
  let maxCount = 0;
  for (const [dateStr, count] of dateMap) {
    if (count > maxCount) {
      maxCount = count;
      mostFrequent = dateStr;
    }
  }

  return mostFrequent;
}




