import React from 'react';
import { Cpu, Loader2, CheckCircle, XCircle, AlertTriangle, Ban } from 'lucide-react';
import { ModelType, ModelStatus, ModelAvailability } from '../../services/geminiService';

interface ModelListProps {
  modelAvailabilities: ModelAvailability[];
  selectedModel: ModelType;
  onModelChange: (model: ModelType) => void;
}

const getStatusIcon = (status: ModelStatus) => {
  switch (status) {
    case 'available':
      return <CheckCircle size={18} className="text-green-400" />;
    case 'quota_exceeded':
      return <AlertTriangle size={18} className="text-yellow-400" />;
    case 'unavailable':
      return <Ban size={18} className="text-red-400" />;
    case 'checking':
      return <Loader2 size={18} className="animate-spin text-blue-400" />;
    default:
      return <XCircle size={18} className="text-gray-400" />;
  }
};

const getStatusText = (status: ModelStatus, error?: string) => {
  switch (status) {
    case 'available': return '利用可能';
    case 'quota_exceeded': return '制限超過';
    case 'unavailable': return error || '利用不可';
    case 'checking': return '確認中...';
    default: return error || 'エラー';
  }
};

export const ModelList: React.FC<ModelListProps> = ({
  modelAvailabilities, selectedModel, onModelChange
}) => {
  if (modelAvailabilities.length === 0) {
    return (
      <div className="text-center text-slate-400 text-sm py-4">
        上のボタンを押してモデルの利用可否を確認してください
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {modelAvailabilities.map((model) => {
        const isAvailable = model.status === 'available';
        const isSelected = selectedModel === model.id;
        return (
          <button
            key={model.id}
            onClick={() => onModelChange(model.id)}
            disabled={!isAvailable}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
              isSelected && isAvailable
                ? 'bg-blue-500/20 border-blue-500 text-white'
                : isAvailable
                ? 'bg-slate-900/50 border-slate-600 text-slate-300 hover:border-slate-500'
                : 'bg-slate-900/30 border-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Cpu size={18} className={isSelected && isAvailable ? 'text-blue-400' : 'text-slate-500'} />
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">{model.name}</div>
              <div className="text-xs text-slate-400">{model.description}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${
                model.status === 'available' ? 'text-green-400' :
                model.status === 'quota_exceeded' ? 'text-yellow-400' :
                model.status === 'checking' ? 'text-blue-400' :
                'text-red-400'
              }`}>
                {getStatusText(model.status, model.error)}
              </span>
              {getStatusIcon(model.status)}
            </div>
          </button>
        );
      })}
    </div>
  );
};
