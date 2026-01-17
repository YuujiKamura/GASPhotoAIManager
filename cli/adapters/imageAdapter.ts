/**
 * CLI Image Adapter
 * Node.js用の画像処理アダプター（sharp使用）
 */

import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ImageInfo {
  fileName: string;
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  date?: number;
}

export interface ScanOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  recursive?: boolean;
}

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.gif'];

/**
 * 画像をリサイズしてBase64に変換
 */
export async function processImage(
  filePath: string,
  options: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<ImageInfo> {
  const { maxWidth = 1024, maxHeight = 1024, quality = 85 } = options;

  const buffer = await fs.readFile(filePath);
  const image = sharp(buffer);
  const metadata = await image.metadata();

  // リサイズが必要かどうかを判定
  let processedImage = image;
  if (
    (metadata.width && metadata.width > maxWidth) ||
    (metadata.height && metadata.height > maxHeight)
  ) {
    processedImage = image.resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // JPEG形式で出力
  const outputBuffer = await processedImage.jpeg({ quality }).toBuffer();
  const base64 = outputBuffer.toString('base64');

  // EXIF日付を抽出
  let date: number | undefined;
  if (metadata.exif) {
    try {
      const exifDate = await extractExifDate(buffer);
      if (exifDate) {
        date = exifDate;
      }
    } catch {
      // EXIF解析エラーは無視
    }
  }

  // EXIF日付がない場合はファイルの更新日時を使用
  if (!date) {
    const stats = await fs.stat(filePath);
    date = stats.mtime.getTime();
  }

  const outputMetadata = await sharp(outputBuffer).metadata();

  return {
    fileName: path.basename(filePath),
    base64: `data:image/jpeg;base64,${base64}`,
    mimeType: 'image/jpeg',
    width: outputMetadata.width || 0,
    height: outputMetadata.height || 0,
    date,
  };
}

/**
 * EXIFから撮影日時を抽出
 */
async function extractExifDate(buffer: Buffer): Promise<number | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.exif) {
      // EXIFデータからDateTimeOriginalを探す
      // sharpはEXIFを直接パースしないので、バッファから手動で探す
      const exifStr = metadata.exif.toString('binary');

      // DateTimeOriginal (0x9003) パターンを探す
      const datePatterns = [
        /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
      ];

      for (const pattern of datePatterns) {
        const match = exifStr.match(pattern);
        if (match) {
          const [, year, month, day, hour, minute, second] = match;
          const dateObj = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
          );
          if (!isNaN(dateObj.getTime())) {
            return dateObj.getTime();
          }
        }
      }
    }
  } catch {
    // パース失敗は無視
  }
  return null;
}

/**
 * フォルダ内の画像をスキャン
 */
export async function scanFolder(
  folderPath: string,
  options: ScanOptions = {}
): Promise<string[]> {
  const { recursive = false } = options;
  const results: string[] = [];

  async function scan(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && recursive) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  await scan(folderPath);

  // ファイル名でソート
  results.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

  return results;
}

/**
 * 複数画像をバッチ処理
 */
export async function processImages(
  filePaths: string[],
  options: ScanOptions = {},
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<ImageInfo[]> {
  const results: ImageInfo[] = [];

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    onProgress?.(i + 1, filePaths.length, path.basename(filePath));

    try {
      const info = await processImage(filePath, options);
      results.push(info);
    } catch (error) {
      console.error(`Failed to process ${filePath}:`, error);
    }
  }

  return results;
}

/**
 * Base64データ部分のみを抽出
 */
export function extractBase64Data(base64WithPrefix: string): string {
  if (base64WithPrefix.includes(',')) {
    return base64WithPrefix.split(',')[1];
  }
  return base64WithPrefix;
}

/**
 * ファイルパスからPhotoInput配列を作成（base64なし、解析用）
 */
export function createPhotoInputs(filePaths: string[]): {
  fileName: string;
  base64: string;
  mimeType: string;
  filePath: string;
}[] {
  return filePaths.map(p => ({
    fileName: path.basename(p),
    base64: '',
    mimeType: 'image/jpeg',
    filePath: p,
  }));
}
