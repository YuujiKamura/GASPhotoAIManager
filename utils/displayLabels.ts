import { ChangeStage } from '../types';

// 変更段階の日本語表示
export const STAGE_LABELS: Record<ChangeStage, { ja: string; en: string; color: string }> = {
  'ai_initial': { ja: 'AI初期解析', en: 'AI Initial', color: 'bg-blue-100 text-blue-700' },
  'context_relay': { ja: '前後継承', en: 'Context Relay', color: 'bg-green-100 text-green-700' },
  'master_validation': { ja: 'マスタ検証', en: 'Master Validation', color: 'bg-orange-100 text-orange-700' },
  'temperature_validation': { ja: '温度検証', en: 'Temp Validation', color: 'bg-red-100 text-red-700' },
  'normalization': { ja: '正規化', en: 'Normalization', color: 'bg-purple-100 text-purple-700' },
  'user_edit': { ja: 'ユーザー編集', en: 'User Edit', color: 'bg-gray-100 text-gray-700' }
};

// フィールド名の日本語表示
export const FIELD_LABELS: Record<string, { ja: string; en: string }> = {
  'workType': { ja: '工種', en: 'Work Type' },
  'variety': { ja: '種別', en: 'Variety' },
  'detail': { ja: '細別', en: 'Detail' },
  'station': { ja: '測点', en: 'Station' },
  'remarks': { ja: '備考', en: 'Remarks' },
  'remarksCategory': { ja: '備考カテゴリ', en: 'Remarks Category' },
  'measurements': { ja: '測定値', en: 'Measurements' },
  'description': { ja: '記事', en: 'Description' }
};
