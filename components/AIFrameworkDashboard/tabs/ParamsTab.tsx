import React from 'react';
import { Cpu, Thermometer, Settings } from 'lucide-react';
import { AVAILABLE_MODELS } from '../../../services/gemini/models';
import { AIFrameworkState } from '../../../hooks/useAIFrameworkState';

interface ParamsTabProps {
  state: AIFrameworkState;
}

export const ParamsTab: React.FC<ParamsTabProps> = ({ state }) => (
  <div className="space-y-4">
    <div className="border rounded p-4">
      <div className="flex items-center gap-2 font-medium mb-3">
        <Cpu size={16} />モデル選択
      </div>
      <div className="space-y-2">
        {AVAILABLE_MODELS.map(model => (
          <label
            key={model.id}
            className={`flex items-center gap-3 p-2 rounded cursor-pointer ${
              state.selectedModel === model.id
                ? 'bg-blue-50 border border-blue-200'
                : 'hover:bg-gray-50 border border-transparent'
            }`}
          >
            <input
              type="radio"
              name="model"
              checked={state.selectedModel === model.id}
              onChange={() => state.handleModelChange(model.id)}
              className="text-blue-600"
            />
            <div className="flex-1">
              <div className="font-medium text-sm">{model.name}</div>
              <div className="text-xs text-gray-500">{model.description}</div>
            </div>
          </label>
        ))}
      </div>
    </div>

    <div className="border rounded p-4">
      <div className="flex items-center gap-2 font-medium mb-3">
        <Thermometer size={16} />Temperature（創造性）
      </div>
      <div className="flex items-center gap-4">
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={state.temperature}
          onChange={(e) => state.saveTemperature(parseFloat(e.target.value))}
          className="flex-1"
        />
        <span className="w-12 text-center font-mono text-sm">{state.temperature}</span>
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>確定的 (0.0)</span>
        <span>創造的 (1.0)</span>
      </div>
    </div>

    <div className="border rounded p-4">
      <div className="flex items-center gap-2 font-medium mb-3">
        <Settings size={16} />API設定
      </div>
      <div className="text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-600">レスポンス形式</span>
          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">application/json</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">ストリーミング</span>
          <span className="text-green-600">有効</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">リトライ回数</span>
          <span>3回</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">フォールバックモデル</span>
          <span className="font-mono text-xs">gemini-2.5-flash</span>
        </div>
      </div>
    </div>
  </div>
);
