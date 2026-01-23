/**
 * 画像pHash計算モジュール
 *
 * pHash（Perceptual Hash）は画像の視覚的特徴をハッシュ値に変換する。
 * 類似した画像は類似したハッシュを持つため、類似度比較に使用できる。
 */

// ハッシュ結果の型
export interface ImageHashResult {
  hash: string;           // 64ビットハッシュ（16進数文字列）
  width: number;          // 元画像の幅
  height: number;         // 元画像の高さ
  computedAt: number;     // 計算日時
}

// ハミング距離の閾値
export const SIMILARITY_THRESHOLD = 10;  // 10ビット以下の差 = 類似

/**
 * Base64画像からpHashを計算
 *
 * アルゴリズム:
 * 1. 画像を8x8にリサイズ
 * 2. グレースケールに変換
 * 3. DCT（離散コサイン変換）を適用
 * 4. 平均値と比較して64ビットハッシュを生成
 */
export const computePHash = async (base64Data: string): Promise<ImageHashResult> => {
  // Canvas APIを使用して画像処理
  const img = await loadImage(base64Data);
  const { grayscale, width, height } = await resizeAndGrayscale(img, 32, 32);

  // DCT計算（簡易版: 8x8のDCT係数を使用）
  const dct = computeDCT(grayscale, 32);

  // 8x8の低周波成分を取得（DC成分を除く）
  const lowFreq: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (x === 0 && y === 0) continue; // DC成分をスキップ
      lowFreq.push(dct[y * 32 + x]);
    }
  }

  // 中央値を計算
  const sorted = [...lowFreq].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // ハッシュ生成（中央値より大きければ1、小さければ0）
  let hash = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (x === 0 && y === 0) {
        hash += '0'; // DC成分は常に0
      } else {
        hash += dct[y * 32 + x] > median ? '1' : '0';
      }
    }
  }

  // 2進数から16進数に変換
  const hexHash = parseInt(hash, 2).toString(16).padStart(16, '0');

  return {
    hash: hexHash,
    width,
    height,
    computedAt: Date.now()
  };
};

/**
 * 2つのハッシュ間のハミング距離を計算
 */
export const hammingDistance = (hash1: string, hash2: string): number => {
  const bin1 = BigInt('0x' + hash1);
  const bin2 = BigInt('0x' + hash2);
  const xor = bin1 ^ bin2;

  // ビットカウント
  let count = 0;
  let n = xor;
  while (n > 0n) {
    count += Number(n & 1n);
    n >>= 1n;
  }
  return count;
};

/**
 * 類似度を0-1のスコアで返す（1が完全一致）
 */
export const computeSimilarity = (hash1: string, hash2: string): number => {
  const distance = hammingDistance(hash1, hash2);
  return 1 - (distance / 64);
};

/**
 * 類似判定
 */
export const isSimilar = (hash1: string, hash2: string, threshold = SIMILARITY_THRESHOLD): boolean => {
  return hammingDistance(hash1, hash2) <= threshold;
};

// ============================================
// 内部ヘルパー関数
// ============================================

const loadImage = (base64Data: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;

    // data:image/... 形式でない場合は追加
    if (!base64Data.startsWith('data:')) {
      base64Data = 'data:image/jpeg;base64,' + base64Data;
    }
    img.src = base64Data;
  });
};

const resizeAndGrayscale = async (
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): Promise<{ grayscale: number[]; width: number; height: number }> => {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d')!;

  // 画像をリサイズして描画
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // ピクセルデータを取得
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = imageData.data;

  // グレースケールに変換
  const grayscale: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // 輝度計算（ITU-R BT.601）
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    grayscale.push(gray);
  }

  return { grayscale, width: img.naturalWidth, height: img.naturalHeight };
};

/**
 * 2D DCT（離散コサイン変換）
 */
const computeDCT = (grayscale: number[], size: number): number[] => {
  const dct: number[] = new Array(size * size).fill(0);

  for (let u = 0; u < size; u++) {
    for (let v = 0; v < size; v++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
          const pixel = grayscale[y * size + x];
          sum += pixel *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
        }
      }

      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct[u * size + v] = (cu * cv * sum) / 4;
    }
  }

  return dct;
};
