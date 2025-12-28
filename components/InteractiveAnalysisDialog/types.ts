import { AIAnalysisResult, PhotoRecord } from '../../types';

// 対話メッセージ
export interface DialogMessage {
  id: string;
  role: 'ai' | 'user' | 'system';
  content: string;
  timestamp: number;
  reasoning?: string;
}

// 選択肢
export interface DialogChoice {
  id: string;
  label: string;
  action: 'accept' | 'modify_workType' | 'modify_station' | 'modify_remarks' | 'custom' | 'retry';
  description?: string;
}

// ダイアログの状態
export interface InteractiveAnalysisState {
  // ダイアログ状態
  isOpen: boolean;
  targetPhoto: PhotoRecord | null;

  // 対話状態
  messages: DialogMessage[];
  currentChoices: DialogChoice[];
  isStreaming: boolean;
  streamingText: string;

  // 解析結果
  currentAnalysis: AIAnalysisResult | null;

  // UI状態
  isProcessing: boolean;
  error: string | null;

  // テキスト入力
  inputText: string;
  showTextInput: boolean;
}

// フック戻り値
export interface UseInteractiveAnalysisReturn {
  state: InteractiveAnalysisState;
  // アクション
  openDialog: (photo: PhotoRecord) => void;
  closeDialog: () => void;
  sendMessage: (text: string) => Promise<void>;
  selectChoice: (choice: DialogChoice) => Promise<void>;
  acceptAnalysis: () => void;
  setInputText: (text: string) => void;
  toggleTextInput: () => void;
}

// デフォルト選択肢
export const DEFAULT_CHOICES: DialogChoice[] = [
  { id: 'accept', label: 'OK', action: 'accept', description: 'この解析結果で確定' },
  { id: 'modify_workType', label: '工種変更', action: 'modify_workType', description: '工種・種別・細別を修正' },
  { id: 'modify_station', label: '測点変更', action: 'modify_station', description: '測点を修正' },
  { id: 'modify_remarks', label: '備考変更', action: 'modify_remarks', description: '備考を修正' },
  { id: 'custom', label: '自由入力', action: 'custom', description: '自由にテキストで指示' },
];

// 初期状態
export const INITIAL_STATE: InteractiveAnalysisState = {
  isOpen: false,
  targetPhoto: null,
  messages: [],
  currentChoices: [],
  isStreaming: false,
  streamingText: '',
  currentAnalysis: null,
  isProcessing: false,
  error: null,
  inputText: '',
  showTextInput: false,
};

// 翻訳
export const TRANSLATIONS = {
  ja: {
    title: '対話型解析',
    close: '中断',
    confirm: '確定して次へ',
    confirmCurrent: 'この結果で確定',
    analyzing: '解析中...',
    sendMessage: '送信',
    placeholder: '指示を入力...',
    noAnalysis: '解析結果がありません',
    workType: '工種',
    variety: '種別',
    detail: '細別',
    station: '測点',
    remarks: '備考',
    measurements: '測定値',
  },
  en: {
    title: 'Interactive Analysis',
    close: 'Cancel',
    confirm: 'Confirm & Next',
    confirmCurrent: 'Confirm Result',
    analyzing: 'Analyzing...',
    sendMessage: 'Send',
    placeholder: 'Enter instruction...',
    noAnalysis: 'No analysis result',
    workType: 'Work Type',
    variety: 'Variety',
    detail: 'Detail',
    station: 'Station',
    remarks: 'Remarks',
    measurements: 'Measurements',
  },
};
