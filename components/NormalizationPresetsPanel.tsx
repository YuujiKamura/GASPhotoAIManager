import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, ToggleLeft, ToggleRight, Download, Upload } from 'lucide-react';
import {
  UserPresets,
  NormalizationMapping,
  addNormalization,
  removeNormalization,
  toggleNormalization,
  exportPresets,
  importPresets
} from '../utils/userPresets';

interface Props {
  presets: UserPresets;
  onChange: (presets: UserPresets) => void;
  collapsed?: boolean;
}

const NormalizationPresetsPanel: React.FC<Props> = ({ presets, onChange, collapsed = true }) => {
  const [isOpen, setIsOpen] = useState(!collapsed);
  const [inputPattern, setInputPattern] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isRegex, setIsRegex] = useState(false);

  const handleAdd = () => {
    if (!inputPattern.trim() || !outputText.trim()) return;
    const updated = addNormalization(presets, inputPattern.trim(), outputText.trim(), isRegex);
    onChange(updated);
    setInputPattern('');
    setOutputText('');
    setIsRegex(false);
  };

  const handleRemove = (id: string) => {
    const updated = removeNormalization(presets, id);
    onChange(updated);
  };

  const handleToggle = (id: string) => {
    const updated = toggleNormalization(presets, id);
    onChange(updated);
  };

  const handleExport = () => {
    const json = exportPresets(presets);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'normalization-presets.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const imported = importPresets(text);
      if (imported) {
        onChange(imported);
      } else {
        alert('無効なファイル形式です');
      }
    };
    input.click();
  };

  const enabledCount = presets.normalizations.filter(n => n.enabled).length;
  const totalCount = presets.normalizations.length;

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-500" />
          )}
          <span className="font-medium text-gray-800">正規化プリセット</span>
          <span className="text-sm text-gray-500">
            ({enabledCount}/{totalCount} 有効)
          </span>
        </div>
        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
          ユーザー定義
        </span>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {/* Add Form */}
          <div className="bg-gray-50 p-3 rounded-lg space-y-3">
            <div className="text-sm font-medium text-gray-700">新規追加</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={inputPattern}
                onChange={(e) => setInputPattern(e.target.value)}
                placeholder="入力パターン"
                className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={outputText}
                onChange={(e) => setOutputText(e.target.value)}
                placeholder="出力テキスト"
                className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={isRegex}
                  onChange={(e) => setIsRegex(e.target.checked)}
                  className="rounded border-gray-300"
                />
                正規表現として扱う
              </label>
              <button
                onClick={handleAdd}
                disabled={!inputPattern.trim() || !outputText.trim()}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                追加
              </button>
            </div>
          </div>

          {/* Mappings List */}
          {presets.normalizations.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">登録済みマッピング</div>
              {presets.normalizations.map((mapping) => (
                <MappingRow
                  key={mapping.id}
                  mapping={mapping}
                  onToggle={() => handleToggle(mapping.id)}
                  onRemove={() => handleRemove(mapping.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center text-sm text-gray-500 py-4">
              マッピングがまだありません
            </div>
          )}

          {/* Import/Export */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={handleImport}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
            >
              <Upload className="w-4 h-4" />
              インポート
            </button>
            <button
              onClick={handleExport}
              disabled={presets.normalizations.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              エクスポート
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface MappingRowProps {
  mapping: NormalizationMapping;
  onToggle: () => void;
  onRemove: () => void;
}

const MappingRow: React.FC<MappingRowProps> = ({ mapping, onToggle, onRemove }) => {
  return (
    <div
      className={`flex items-center gap-3 p-2 rounded border ${
        mapping.enabled
          ? 'border-gray-200 bg-white'
          : 'border-gray-100 bg-gray-50 opacity-60'
      }`}
    >
      <button
        onClick={onToggle}
        className="text-gray-500 hover:text-blue-600"
        title={mapping.enabled ? '無効にする' : '有効にする'}
      >
        {mapping.enabled ? (
          <ToggleRight className="w-5 h-5 text-blue-600" />
        ) : (
          <ToggleLeft className="w-5 h-5" />
        )}
      </button>

      <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1 text-sm">
          <code className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-800 truncate">
            {mapping.input}
          </code>
          {mapping.isRegex && (
            <span className="text-xs text-purple-600 bg-purple-50 px-1 rounded">regex</span>
          )}
        </div>
        <div className="text-sm">
          <span className="text-gray-400 mr-1">→</span>
          <code className="px-1.5 py-0.5 bg-green-50 rounded text-green-800 truncate">
            {mapping.output}
          </code>
        </div>
      </div>

      <button
        onClick={onRemove}
        className="text-gray-400 hover:text-red-600"
        title="削除"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};

export default NormalizationPresetsPanel;
