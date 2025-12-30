import React from 'react';
import { Cpu, Thermometer, Settings } from 'lucide-react';
import { AVAILABLE_MODELS } from '../../services/gemini/models';

interface ModelSelectorProps {
  selectedModel: string;
  handleModelChange: (modelId: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, handleModelChange }) => (
  <div className="border rounded p-4">
    <div className="flex items-center gap-2 font-medium mb-3"><Cpu size={16} />Model Selection</div>
    <div className="space-y-2">
      {AVAILABLE_MODELS.map(model => (
        <label key={model.id} className={`flex items-center gap-3 p-2 rounded cursor-pointer ${selectedModel === model.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}>
          <input type="radio" name="model" checked={selectedModel === model.id} onChange={() => handleModelChange(model.id)} className="text-blue-600" />
          <div className="flex-1">
            <div className="font-medium text-sm">{model.name}</div>
            <div className="text-xs text-gray-500">{model.description}</div>
          </div>
        </label>
      ))}
    </div>
  </div>
);

interface TemperatureSliderProps {
  temperature: number;
  saveTemperature: (value: number) => void;
}

export const TemperatureSlider: React.FC<TemperatureSliderProps> = ({ temperature, saveTemperature }) => (
  <div className="border rounded p-4">
    <div className="flex items-center gap-2 font-medium mb-3"><Thermometer size={16} />Temperature (Creativity)</div>
    <div className="flex items-center gap-4">
      <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => saveTemperature(parseFloat(e.target.value))} className="flex-1" />
      <span className="w-12 text-center font-mono text-sm">{temperature}</span>
    </div>
    <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Deterministic (0.0)</span><span>Creative (1.0)</span></div>
  </div>
);

export const APISettingsPanel: React.FC = () => (
  <div className="border rounded p-4">
    <div className="flex items-center gap-2 font-medium mb-3"><Settings size={16} />API Settings</div>
    <div className="text-sm space-y-2">
      <div className="flex justify-between"><span className="text-gray-600">Response format</span><span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">application/json</span></div>
      <div className="flex justify-between"><span className="text-gray-600">Streaming</span><span className="text-green-600">Enabled</span></div>
      <div className="flex justify-between"><span className="text-gray-600">Retry count</span><span>3</span></div>
      <div className="flex justify-between"><span className="text-gray-600">Fallback model</span><span className="font-mono text-xs">gemini-2.5-flash</span></div>
    </div>
  </div>
);
