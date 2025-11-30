/**
 * PDF用HTMLテンプレート
 * PhotoAlbumViewと同じスタイルを使用
 * CLI/GUIで共通利用
 */

export interface PhotoData {
  fileName: string;
  base64Src: string;  // data:image/jpeg;base64,... 形式
  workType: string;
  variety: string;
  detail: string;
  station: string;
  remarks: string;
  description: string;
  date?: string;
}

export interface PDFTemplateOptions {
  photosPerPage: 2 | 3;
  title?: string;
  fontSize?: number; // テキストサイズ (デフォルト: 14px)
}

// 情報行を生成する関数
// 情報行を生成する関数 (Table Row)
function generateInfoRow(label: string, value: string, options: {
  height?: 'h28' | 'h56' | 'flex-fill';
  multiline?: boolean;
} = {}): string {
  const { height = 'h28', multiline = false } = options;
  const labelClass = multiline ? 'label multiline' : 'label';
  const valueClass = multiline ? 'value multiline' : 'value';

  // 記事欄で温度表記がある場合、改行を挿入
  let formattedValue = value;
  if (label === '記事' && value) {
    // 温度パターン (例: "到着温度(単位:°C)159.8") の前に改行を追加
    formattedValue = value.replace(/([到着敷均初期締固開放].*温度.*°C[)\]]?)(\d)/g, '$1<br>$2');
  }

  return `
    <tr class="${height}">
      <td class="${labelClass}">${label}</td>
      <td class="${valueClass}">${formattedValue}</td>
    </tr>`;
}

// 3枚/ページ用のスロットを生成
function generateThreeUpSlot(photo: PhotoData | null): string {
  if (!photo) {
    return `<div class="slot three-up empty"></div>`;
  }

  const rows = [
    generateInfoRow('工種', photo.workType || ''),
    generateInfoRow('種別', photo.variety || ''),
    generateInfoRow('細別', photo.detail || ''),
    generateInfoRow('測点', photo.station || ''),
    generateInfoRow('備考', photo.remarks || '', { height: 'h56', multiline: true }),
    generateInfoRow('記事', photo.description || '', { height: 'flex-fill', multiline: true }),
  ];

  return `
    <div class="slot three-up">
      <div class="image-container three-up">
        ${photo.base64Src ? `<img src="${photo.base64Src}" alt="${photo.fileName}" />` : ''}
      </div>
      <div class="info-container three-up">
        <table class="info-table">
          ${rows.join('')}
        </table>
      </div>
    </div>`;
}

// 2枚/ページ用のスロットを生成
function generateTwoUpSlot(photo: PhotoData | null): string {
  if (!photo) {
    return `<div class="slot two-up empty"></div>`;
  }

  return `
    <div class="slot two-up">
      <div class="image-container two-up">
        ${photo.base64Src ? `<img src="${photo.base64Src}" alt="${photo.fileName}" />` : ''}
      </div>
      <div class="info-container two-up">
        <div class="info-row-inline">
          <span class="value-inline">${photo.remarks || ''}</span>
        </div>
        <div class="info-row-inline">
          <span class="value-inline">${photo.station || ''}</span>
        </div>
      </div>
    </div>`;
}

// ページを生成
function generatePage(slots: string[], title: string, pageIndex: number): string {
  return `
    <div class="page">
      <div class="header">
        <h1>${title}</h1>
        <div class="page-num">Page ${pageIndex + 1}</div>
      </div>
      <div class="content">
        ${slots.join('')}
      </div>
    </div>`;
}

/**
 * PDF用のHTMLを生成
 * PhotoAlbumViewのTailwindスタイルを純粋なCSSで再現
 */
export function generatePDFHTML(
  photos: PhotoData[],
  options: PDFTemplateOptions = { photosPerPage: 3 }
): string {
  const { photosPerPage, title = '工事写真帳', fontSize = 14 } = options;
  const totalPages = Math.ceil(photos.length / photosPerPage);
  const isTwoUp = photosPerPage === 2;
  const generateSlot = isTwoUp ? generateTwoUpSlot : generateThreeUpSlot;

  const pages: string[] = [];

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const slots: string[] = [];

    for (let slotIndex = 0; slotIndex < photosPerPage; slotIndex++) {
      const photoIndex = pageIndex * photosPerPage + slotIndex;
      const photo = photos[photoIndex] || null;
      slots.push(generateSlot(photo));
    }

    pages.push(generatePage(slots, title, pageIndex));
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    @page {
      size: A4 portrait;
      margin: 0;
    }
    body {
      font-family: 'Noto Sans JP', 'Yu Gothic', 'Meiryo', sans-serif;
      font-size: 12px;
      background: white;
      color: #111827; /* text-gray-900 */
      -webkit-font-smoothing: antialiased;
    }

    /* Page Container - matches .sheet-preview */
    .page {
      width: 210mm;
      height: 297mm;
      padding: 24px 48px; /* px-12 py-6 */
      page-break-after: always;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }
    .page:last-child {
      page-break-after: auto;
    }

    /* Header - matches PhotoAlbumView header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 8px; /* mb-2 */
      flex-shrink: 0;
    }
    .header h1 {
      font-size: 20px; /* text-xl */
      font-weight: bold;
      color: #111827;
      border-bottom: 2px solid #111827;
      line-height: 1;
      padding-bottom: 4px;
      padding-left: 4px;
      padding-right: 4px;
    }
    .page-num {
      font-size: 14px; /* text-sm */
      font-weight: bold;
      color: #1f2937; /* text-gray-800 */
    }

    /* Content Border Box */
    .content {
      flex: 1;
      border: 1px solid #9ca3af; /* border-gray-400 */
      background: white;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    /* Slot - each photo row */
    .slot {
      border-bottom: 1px solid #d1d5db; /* border-gray-300 */
      display: flex;
      min-height: 0;
    }
    .slot:last-child {
      border-bottom: none;
    }
    .slot.empty {
      background: #fafafa;
    }

    /* 3-up Layout */
    .slot.three-up {
      flex: 1;
      flex-direction: row;
      height: 33.33%;
    }
    .image-container.three-up {
      width: 65%;
      border-right: 1px solid #d1d5db;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      padding: 4px;
    }

    /* 2-up Layout */
    .slot.two-up {
      flex: 1;
      flex-direction: column;
      height: 50%;
    }
    .image-container.two-up {
      flex: 1;
      border-bottom: 1px solid #d1d5db;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      padding: 2px;
    }
    .info-container.two-up {
      height: auto;
      display: flex;
      flex-direction: column;
      background: white;
      padding: 4px 16px;
      gap: 4px;
    }
    .info-row-inline {
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .value-inline {
      font-size: 14px;
      color: #111827;
      font-weight: 500;
      text-align: center;
    }

    /* Image */
    .image-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    /* Info Container - Table Layout */
    .info-container.three-up {
      width: 35%;
      height: 100%;
      background: white;
    }

    .info-table {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
      border-style: hidden; /* 外枠はコンテナやセルで制御 */
      table-layout: fixed;
    }

    .info-table td {
      border: 1px solid #d1d5db;
      padding: 0;
      vertical-align: middle;
    }

    /* Row Heights */
    tr.h28 {
      height: 28px;
    }
    tr.h56 {
      height: 56px;
    }
    tr.flex-fill {
      height: auto; /* 残りの高さを埋める */
    }

    /* Label Cell */
    .label {
      width: 48px;
      background: rgba(249, 250, 251, 0.5);
      text-align: center;
      font-size: ${fontSize}px;
      color: #111827;
      font-weight: normal;
      padding: 0 2px;
      line-height: 1.25;
    }
    .label.multiline {
      vertical-align: top;
      padding-top: 4px;
    }

    /* Value Cell */
    .value {
      padding: 2px 4px;
      font-size: ${fontSize}px;
      color: #111827;
      font-weight: normal;
      line-height: 1.25;
      word-break: break-all;
      background: white;
    }
    .value.multiline {
      vertical-align: top;
      padding-top: 4px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  ${pages.join('')}
</body>
</html>
  `;
}
