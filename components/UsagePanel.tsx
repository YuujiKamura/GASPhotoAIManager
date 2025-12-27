import React, { useState, useEffect } from 'react';
import { Activity, Image, Coins, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { UsageSummary, getUsageSummary, addUsageListener, removeUsageListener, resetUsage, formatBytes, formatCostJPY } from '../services/usageTracker';

interface UsagePanelProps {
  photoCount: number;
  totalImageSize: number;
}

const UsagePanel: React.FC<UsagePanelProps> = ({ photoCount, totalImageSize }) => {
  const [usage, setUsage] = useState<UsageSummary>(getUsageSummary());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const listener = (summary: UsageSummary) => setUsage(summary);
    addUsageListener(listener);
    return () => removeUsageListener(listener);
  }, []);

  const handleReset = () => {
    if (confirm('使用量カウンターをリセットしますか？')) {
      resetUsage();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-slate-900/95 backdrop-blur border border-slate-700 rounded-2xl shadow-xl overflow-hidden min-w-[280px]">
        {/* ヘッダー（常に表示） */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-blue-400" />
            <span className="text-sm font-bold text-white">API使用量</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-yellow-400">
              {formatCostJPY(usage.estimatedCostUSD)}
            </span>
            {expanded ? (
              <ChevronDown size={16} className="text-slate-400" />
            ) : (
              <ChevronUp size={16} className="text-slate-400" />
            )}
          </div>
        </button>

        {/* 詳細パネル */}
        {expanded && (
          <div className="border-t border-slate-700 p-3 space-y-3">
            {/* 画像情報 */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <Image size={14} />
                <span>読込画像</span>
              </div>
              <div className="text-white font-mono">
                {photoCount}枚 ({formatBytes(totalImageSize)})
              </div>
            </div>

            {/* APIコール数 */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <Activity size={14} />
                <span>APIコール</span>
              </div>
              <div className="text-white font-mono">
                {usage.totalCalls}回
              </div>
            </div>

            {/* トークン数 */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="w-3.5 text-center">→</span>
                <span>入力トークン</span>
              </div>
              <div className="text-white font-mono">
                {usage.totalInputTokens.toLocaleString()}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="w-3.5 text-center">←</span>
                <span>出力トークン</span>
              </div>
              <div className="text-white font-mono">
                {usage.totalOutputTokens.toLocaleString()}
              </div>
            </div>

            {/* コスト */}
            <div className="border-t border-slate-700 pt-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <Coins size={14} />
                <span>推定コスト</span>
              </div>
              <div className="text-yellow-400 font-mono font-bold">
                ${usage.estimatedCostUSD.toFixed(4)} ({formatCostJPY(usage.estimatedCostUSD)})
              </div>
            </div>

            {/* 注意書き */}
            <div className="text-[10px] text-slate-500 pt-2">
              ※ 推定値です。実際の課金額とは異なる場合があります。
            </div>

            {/* リセットボタン */}
            <button
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white py-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <RotateCcw size={12} />
              カウンターをリセット
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UsagePanel;
