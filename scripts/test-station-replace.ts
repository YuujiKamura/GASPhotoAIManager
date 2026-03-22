/**
 * 測点一括置換のフロー確認テスト
 */

import { PhotoRecord, AIAnalysisResult } from '../types';

// モックデータ
const mockPhotos: PhotoRecord[] = [
  {
    fileName: 'DSC0001.jpg',
    base64: '',
    mimeType: 'image/jpeg',
    status: 'done',
    analysis: {
      fileName: 'DSC0001.jpg',
      workType: '舗装工',
      variety: '舗装打換え工',
      detail: '表層工',
      station: '○○町1丁目 N-4',  // 正規化されていない形式
      remarks: '着手前',
      description: '',
      hasBoard: true,
      detectedText: ''
    }
  },
  {
    fileName: 'DSC0002.jpg',
    base64: '',
    mimeType: 'image/jpeg',
    status: 'done',
    analysis: {
      fileName: 'DSC0002.jpg',
      workType: '舗装工',
      variety: '舗装打換え工',
      detail: '表層工',
      station: '○○町1丁目 N-4',  // 同じ
      remarks: '完了',
      description: '',
      hasBoard: true,
      detectedText: ''
    }
  },
  {
    fileName: 'DSC0003.jpg',
    base64: '',
    mimeType: 'image/jpeg',
    status: 'done',
    analysis: {
      fileName: 'DSC0003.jpg',
      workType: '舗装工',
      variety: '舗装打換え工',
      detail: '表層工',
      station: '○○町1丁目6-6付近',  // 別の形式
      remarks: '施工中',
      description: '',
      hasBoard: true,
      detectedText: ''
    }
  },
  {
    fileName: 'DSC0004.jpg',
    base64: '',
    mimeType: 'image/jpeg',
    status: 'done',
    analysis: {
      fileName: 'DSC0004.jpg',
      workType: '安全管理',
      variety: '',
      detail: '朝礼状況',
      station: '○○町1丁目 No.4',  // 正規化済み形式
      remarks: '',
      description: '',
      hasBoard: false,
      detectedText: ''
    }
  }
];

// === テスト1: 測点の集計 ===
function testStationStats() {
  console.log('\n=== テスト1: 測点の集計 ===');

  const stats = new Map<string, { count: number; fileNames: string[] }>();
  mockPhotos.forEach(photo => {
    const station = photo.analysis?.station || '';
    if (station) {
      if (!stats.has(station)) {
        stats.set(station, { count: 0, fileNames: [] });
      }
      const s = stats.get(station)!;
      s.count++;
      s.fileNames.push(photo.fileName);
    }
  });

  console.log('測点一覧:');
  stats.forEach((data, station) => {
    console.log(`  "${station}": ${data.count}枚 (${data.fileNames.join(', ')})`);
  });

  // 期待値
  const expected = [
    { station: '○○町1丁目 N-4', count: 2 },
    { station: '○○町1丁目6-6付近', count: 1 },
    { station: '○○町1丁目 No.4', count: 1 }
  ];

  let passed = true;
  expected.forEach(exp => {
    const actual = stats.get(exp.station);
    if (!actual || actual.count !== exp.count) {
      console.log(`  ❌ FAIL: "${exp.station}" expected ${exp.count}, got ${actual?.count || 0}`);
      passed = false;
    }
  });

  if (passed) {
    console.log('✅ テスト1 PASS');
  }
  return passed;
}

// === テスト2: 置換プレビュー ===
function testReplacementPreview() {
  console.log('\n=== テスト2: 置換プレビュー ===');

  const searchText = 'N-4';
  const replaceText = 'No.4';

  // stationStats を生成
  const stats = new Map<string, { count: number; fileNames: string[] }>();
  mockPhotos.forEach(photo => {
    const station = photo.analysis?.station || '';
    if (station) {
      if (!stats.has(station)) {
        stats.set(station, { count: 0, fileNames: [] });
      }
      const s = stats.get(station)!;
      s.count++;
      s.fileNames.push(photo.fileName);
    }
  });

  const stationStats = Array.from(stats.entries())
    .map(([station, data]) => ({ station, ...data }));

  // プレビュー生成
  const replacements: Array<{ original: string; replaced: string; fileNames: string[] }> = [];
  stationStats.forEach(({ station, fileNames }) => {
    if (station.includes(searchText)) {
      const replaced = station.replace(new RegExp(searchText, 'g'), replaceText);
      replacements.push({ original: station, replaced, fileNames });
    }
  });

  console.log(`検索: "${searchText}" → 置換: "${replaceText}"`);
  console.log('プレビュー:');
  replacements.forEach(r => {
    console.log(`  "${r.original}" → "${r.replaced}" (${r.fileNames.length}枚)`);
  });

  // 期待値: "○○町1丁目 N-4" が "○○町1丁目 No.4" に置換される（2枚）
  if (replacements.length !== 1) {
    console.log(`❌ FAIL: マッチ数が違う expected 1, got ${replacements.length}`);
    return false;
  }
  if (replacements[0].original !== '○○町1丁目 N-4' || replacements[0].replaced !== '○○町1丁目 No.4') {
    console.log(`❌ FAIL: 置換内容が違う`);
    return false;
  }
  if (replacements[0].fileNames.length !== 2) {
    console.log(`❌ FAIL: 対象ファイル数が違う expected 2, got ${replacements[0].fileNames.length}`);
    return false;
  }

  console.log('✅ テスト2 PASS');
  return true;
}

// === テスト3: 置換の適用 ===
function testApplyReplacement() {
  console.log('\n=== テスト3: 置換の適用 ===');

  // onReplaceに渡されるデータ
  const replacementsToApply = [
    { fileName: 'DSC0001.jpg', newStation: '○○町1丁目 No.4' },
    { fileName: 'DSC0002.jpg', newStation: '○○町1丁目 No.4' }
  ];

  // App.tsxのhandleStationReplaceと同じロジック
  const updatedPhotos = mockPhotos.map(p => {
    const replacement = replacementsToApply.find(r => r.fileName === p.fileName);
    if (replacement && p.analysis) {
      const updatedAnalysis = { ...p.analysis, station: replacement.newStation };
      return { ...p, analysis: updatedAnalysis };
    }
    return p;
  });

  console.log('適用後の測点:');
  updatedPhotos.forEach(p => {
    console.log(`  ${p.fileName}: "${p.analysis?.station}"`);
  });

  // 検証
  let passed = true;
  const dsc0001 = updatedPhotos.find(p => p.fileName === 'DSC0001.jpg');
  const dsc0002 = updatedPhotos.find(p => p.fileName === 'DSC0002.jpg');
  const dsc0003 = updatedPhotos.find(p => p.fileName === 'DSC0003.jpg');
  const dsc0004 = updatedPhotos.find(p => p.fileName === 'DSC0004.jpg');

  if (dsc0001?.analysis?.station !== '○○町1丁目 No.4') {
    console.log(`❌ FAIL: DSC0001の測点が更新されていない`);
    passed = false;
  }
  if (dsc0002?.analysis?.station !== '○○町1丁目 No.4') {
    console.log(`❌ FAIL: DSC0002の測点が更新されていない`);
    passed = false;
  }
  if (dsc0003?.analysis?.station !== '○○町1丁目6-6付近') {
    console.log(`❌ FAIL: DSC0003の測点が意図せず変更された`);
    passed = false;
  }
  if (dsc0004?.analysis?.station !== '○○町1丁目 No.4') {
    console.log(`❌ FAIL: DSC0004の測点が意図せず変更された`);
    passed = false;
  }

  if (passed) {
    console.log('✅ テスト3 PASS');
  }
  return passed;
}

// === テスト4: フロー全体のシミュレーション ===
function testFullFlow() {
  console.log('\n=== テスト4: フロー全体のシミュレーション ===');

  // Step 1: モーダルを開く（photos を渡す）
  console.log('1. モーダルを開く');
  const photos = [...mockPhotos];

  // Step 2: 検索・置換テキストを入力
  console.log('2. 検索: "N-4", 置換: "No.4"');
  const searchText = 'N-4';
  const replaceText = 'No.4';

  // Step 3: プレビュー生成
  const stats = new Map<string, { count: number; fileNames: string[] }>();
  photos.forEach(photo => {
    const station = photo.analysis?.station || '';
    if (station) {
      if (!stats.has(station)) {
        stats.set(station, { count: 0, fileNames: [] });
      }
      const s = stats.get(station)!;
      s.count++;
      s.fileNames.push(photo.fileName);
    }
  });

  const stationStats = Array.from(stats.entries())
    .map(([station, data]) => ({ station, ...data }));

  const previewReplacements: Array<{ original: string; replaced: string; fileNames: string[] }> = [];
  stationStats.forEach(({ station, fileNames }) => {
    if (station.includes(searchText)) {
      const replaced = station.replace(new RegExp(searchText, 'g'), replaceText);
      previewReplacements.push({ original: station, replaced, fileNames });
    }
  });

  console.log(`3. プレビュー: ${previewReplacements.length}件マッチ`);

  // Step 4: すべて選択
  const selectedStations = new Set<string>();
  previewReplacements.forEach(r => selectedStations.add(r.original));
  console.log(`4. 選択: ${selectedStations.size}件`);

  // Step 5: 置換実行（handleApply）
  const replacements: Array<{ fileName: string; newStation: string }> = [];
  previewReplacements.forEach(({ original, replaced, fileNames }) => {
    if (selectedStations.has(original)) {
      fileNames.forEach(fileName => {
        replacements.push({ fileName, newStation: replaced });
      });
    }
  });
  console.log(`5. onReplace呼び出し: ${replacements.length}件`);

  // Step 6: App.tsx の handleStationReplace
  let updatedPhotos = photos.map(p => {
    const replacement = replacements.find(r => r.fileName === p.fileName);
    if (replacement && p.analysis) {
      const updatedAnalysis = { ...p.analysis, station: replacement.newStation };
      return { ...p, analysis: updatedAnalysis };
    }
    return p;
  });

  console.log('6. 更新完了');

  // 検証
  const stationsAfter = new Set<string>();
  updatedPhotos.forEach(p => {
    if (p.analysis?.station) stationsAfter.add(p.analysis.station);
  });

  console.log('\n更新後の測点一覧:');
  stationsAfter.forEach(s => console.log(`  - ${s}`));

  // N-4 が残っていないことを確認
  let passed = true;
  updatedPhotos.forEach(p => {
    if (p.analysis?.station?.includes('N-4')) {
      console.log(`❌ FAIL: ${p.fileName} にまだ "N-4" が含まれている: "${p.analysis.station}"`);
      passed = false;
    }
  });

  if (passed) {
    console.log('✅ テスト4 PASS');
  }
  return passed;
}

// === メイン ===
console.log('========================================');
console.log('測点一括置換 フローテスト');
console.log('========================================');

const results = [
  testStationStats(),
  testReplacementPreview(),
  testApplyReplacement(),
  testFullFlow()
];

console.log('\n========================================');
console.log(`結果: ${results.filter(r => r).length}/${results.length} PASS`);
console.log('========================================');

if (results.every(r => r)) {
  console.log('\n✅ すべてのテストに合格しました！');
  console.log('\nロジックは正しく動作しています。');
  console.log('UIの接続に問題がある可能性があります。');
} else {
  console.log('\n❌ 失敗したテストがあります');
  process.exit(1);
}
