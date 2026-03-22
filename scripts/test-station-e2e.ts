/**
 * E2Eスタイルの測点置換テスト
 * 実際のコンポーネントロジックをシミュレート
 */

// React状態をシミュレート
class MockReactState<T> {
  private _value: T;
  private _listeners: Array<(v: T) => void> = [];

  constructor(initial: T) {
    this._value = initial;
  }

  get value() { return this._value; }

  setState(updater: T | ((prev: T) => T)) {
    if (typeof updater === 'function') {
      this._value = (updater as (prev: T) => T)(this._value);
    } else {
      this._value = updater;
    }
    this._listeners.forEach(l => l(this._value));
  }

  subscribe(listener: (v: T) => void) {
    this._listeners.push(listener);
  }
}

// 型定義
interface AIAnalysisResult {
  fileName: string;
  workType: string;
  variety: string;
  detail: string;
  station: string;
  remarks: string;
  description: string;
  hasBoard: boolean;
  detectedText: string;
}

interface PhotoRecord {
  fileName: string;
  base64: string;
  mimeType: string;
  status: string;
  analysis?: AIAnalysisResult;
}

// === App.tsxのロジック ===
function createApp() {
  const photos = new MockReactState<PhotoRecord[]>([]);
  const showStationReplace = new MockReactState(false);
  const successMsg = new MockReactState<string | null>(null);
  const logs: string[] = [];

  const addLog = (msg: string) => {
    logs.push(msg);
    console.log(`[LOG] ${msg}`);
  };

  // handleStationReplace - App.tsxからコピー
  const handleStationReplace = (replacements: Array<{ fileName: string; newStation: string }>) => {
    console.log('[DEBUG] handleStationReplace called');
    console.log('[DEBUG] replacements:', replacements);
    console.log('[DEBUG] current photos count:', photos.value.length);

    if (replacements.length === 0) {
      console.warn('[DEBUG] No replacements to apply!');
      return;
    }

    photos.setState(prev => {
      console.log('[DEBUG] setPhotos prev count:', prev.length);
      const updated = prev.map(p => {
        const replacement = replacements.find(r => r.fileName === p.fileName);
        if (replacement && p.analysis) {
          console.log(`[DEBUG] Updating ${p.fileName}: "${p.analysis.station}" → "${replacement.newStation}"`);
          return { ...p, analysis: { ...p.analysis, station: replacement.newStation } };
        }
        return p;
      });
      console.log('[DEBUG] Updated photos count:', updated.length);
      return updated;
    });
    successMsg.setState(`${replacements.length}枚の測点を更新しました`);
    addLog(`測点を一括置換: ${replacements.length}枚`);
  };

  return { photos, showStationReplace, successMsg, logs, handleStationReplace, addLog };
}

// === StationReplaceModalのロジック ===
function createModal(photos: PhotoRecord[], onReplace: (r: Array<{ fileName: string; newStation: string }>) => void) {
  // 状態
  let searchText = '';
  let replaceText = '';
  let selectedStations = new Set<string>();

  // stationStats - useMemoのシミュレート
  const computeStationStats = () => {
    console.log('[DEBUG stationStats] Computing for', photos.length, 'photos');
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
    const result = Array.from(stats.entries())
      .map(([station, data]) => ({ station, ...data }))
      .sort((a, b) => b.count - a.count);
    console.log('[DEBUG stationStats] Found stations:', result.map(r => `"${r.station}" (${r.count})`));
    return result;
  };

  // previewReplacements
  const computePreviewReplacements = (stationStats: ReturnType<typeof computeStationStats>) => {
    if (!searchText) return [];
    const replacements: Array<{ original: string; replaced: string; fileNames: string[] }> = [];
    stationStats.forEach(({ station, fileNames }) => {
      if (station.includes(searchText)) {
        const replaced = station.replace(new RegExp(searchText, 'g'), replaceText);
        replacements.push({ original: station, replaced, fileNames });
      }
    });
    return replacements;
  };

  // handleApply
  const handleApply = () => {
    const stationStats = computeStationStats();
    const previewReplacements = computePreviewReplacements(stationStats);

    console.log('[DEBUG handleApply] Called');
    console.log('[DEBUG handleApply] selectedStations:', Array.from(selectedStations));
    console.log('[DEBUG handleApply] previewReplacements:', previewReplacements);

    const replacements: Array<{ fileName: string; newStation: string }> = [];

    previewReplacements.forEach(({ original, replaced, fileNames }) => {
      console.log(`[DEBUG] Checking "${original}" - selected: ${selectedStations.has(original)}`);
      if (selectedStations.has(original)) {
        fileNames.forEach(fileName => {
          replacements.push({ fileName, newStation: replaced });
        });
      }
    });

    console.log('[DEBUG handleApply] Final replacements:', replacements);

    if (replacements.length > 0) {
      console.log('[DEBUG handleApply] Calling onReplace with', replacements.length, 'items');
      onReplace(replacements);
    } else {
      console.warn('[DEBUG handleApply] No replacements to apply - nothing selected?');
    }
  };

  // 検索テキスト設定時の自動選択
  const setSearch = (text: string) => {
    searchText = text;
    const stationStats = computeStationStats();
    const previewReplacements = computePreviewReplacements(stationStats);

    // useEffectのシミュレート - 自動選択
    if (previewReplacements.length > 0) {
      selectedStations = new Set<string>();
      previewReplacements.forEach(r => selectedStations.add(r.original));
      console.log('[DEBUG] Auto-selected', selectedStations.size, 'stations');
    } else {
      selectedStations = new Set();
    }
  };

  const setReplace = (text: string) => {
    replaceText = text;
  };

  return { setSearch, setReplace, handleApply, computeStationStats };
}

// === テスト実行 ===
console.log('==========================================');
console.log('E2E測点置換テスト');
console.log('==========================================');

// 1. Appを初期化
const app = createApp();

// 2. 写真データを設定
const testPhotos: PhotoRecord[] = [
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
      station: '○○町1丁目 N-4',
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
      station: '○○町1丁目 N-4',
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
      station: '○○町1丁目 No.4',
      remarks: '施工中',
      description: '',
      hasBoard: true,
      detectedText: ''
    }
  }
];

app.photos.setState(testPhotos);
console.log('\n[STEP 1] 写真データを設定:', app.photos.value.length, '枚');

// 3. モーダルを開く
const modal = createModal(app.photos.value, app.handleStationReplace);
console.log('\n[STEP 2] モーダルを開く');

// 4. 測点一覧を確認
console.log('\n[STEP 3] 測点一覧:');
const stats = modal.computeStationStats();

// 5. 検索・置換を設定
console.log('\n[STEP 4] 検索: "N-4" → 置換: "No.4"');
modal.setSearch('N-4');
modal.setReplace('No.4');

// 6. 置換実行
console.log('\n[STEP 5] 置換実行');
modal.handleApply();

// 7. 結果確認
console.log('\n[STEP 6] 結果確認');
console.log('更新後の測点:');
app.photos.value.forEach(p => {
  console.log(`  ${p.fileName}: "${p.analysis?.station}"`);
});

// 検証
console.log('\n==========================================');
console.log('検証');
console.log('==========================================');

let allPassed = true;
app.photos.value.forEach(p => {
  if (p.fileName === 'DSC0001.jpg' || p.fileName === 'DSC0002.jpg') {
    if (p.analysis?.station !== '○○町1丁目 No.4') {
      console.log(`❌ FAIL: ${p.fileName} の測点が更新されていない: "${p.analysis?.station}"`);
      allPassed = false;
    } else {
      console.log(`✅ PASS: ${p.fileName} → "${p.analysis?.station}"`);
    }
  } else if (p.fileName === 'DSC0003.jpg') {
    if (p.analysis?.station !== '○○町1丁目 No.4') {
      console.log(`❌ FAIL: ${p.fileName} の測点が変わってしまった: "${p.analysis?.station}"`);
      allPassed = false;
    } else {
      console.log(`✅ PASS: ${p.fileName} → "${p.analysis?.station}" (変更なし)`);
    }
  }
});

console.log('\n==========================================');
if (allPassed) {
  console.log('✅ E2Eテスト合格！');
} else {
  console.log('❌ E2Eテスト失敗');
  process.exit(1);
}
