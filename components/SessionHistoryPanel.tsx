import React, { useState, useEffect } from 'react';
import { History, Trash2, Download, X, Calendar, Image, FileText } from 'lucide-react';
import { AnalysisHistoryEntry } from '../types';
import { getAnalysisHistory, deleteAnalysisHistory, clearAnalysisHistory } from '../utils/storage';

interface Props {
  onLoad: (entry: AnalysisHistoryEntry) => void;
  onClose: () => void;
}

const SessionHistoryPanel: React.FC<Props> = ({ onLoad, onClose }) => {
  const [entries, setEntries] = useState<AnalysisHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const history = await getAnalysisHistory();
      setEntries(history);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('この履歴を削除しますか？')) return;
    try {
      await deleteAnalysisHistory(id);
      setEntries(prev => prev.filter(entry => entry.id !== id));
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    try {
      await clearAnalysisHistory();
      setEntries([]);
      setConfirmClear(false);
    } catch (e) {
      console.error('Failed to clear:', e);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFullDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5" />
            <h3 className="font-bold text-lg">解析履歴</h3>
            <span className="text-purple-200 text-sm">({entries.length}件)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-purple-600 rounded-full animate-spin"></div>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>解析履歴がありません</p>
              <p className="text-sm mt-1">写真を解析すると自動的に保存されます</p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map(entry => (
                <div
                  key={entry.id}
                  onClick={() => onLoad(entry)}
                  className="group border border-gray-200 rounded-lg p-3 hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Date & Time */}
                      <div className="flex items-center gap-2 text-gray-700 font-medium">
                        <Calendar className="w-4 h-4 text-purple-500" />
                        <span>{formatFullDate(entry.updatedAt || entry.createdAt)}</span>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Image className="w-3.5 h-3.5" />
                          <span>{entry.photoCount}枚</span>
                        </div>
                        {entry.modelUsed && (
                          <div className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {entry.modelUsed.replace('models/', '')}
                          </div>
                        )}
                      </div>

                      {/* Work Types */}
                      {entry.workTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entry.workTypes.slice(0, 3).map((wt, i) => (
                            <span key={i} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                              {wt}
                            </span>
                          ))}
                          {entry.workTypes.length > 3 && (
                            <span className="text-xs text-gray-400">
                              +{entry.workTypes.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Instruction (truncated) */}
                      {entry.instruction && (
                        <div className="flex items-start gap-1 mt-2 text-xs text-gray-400">
                          <FileText className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span className="truncate">{entry.instruction.substring(0, 50)}{entry.instruction.length > 50 ? '...' : ''}</span>
                        </div>
                      )}
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={(e) => handleDelete(entry.id, e)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {entries.length > 0 && (
          <div className="border-t border-gray-200 p-4 flex justify-between items-center">
            <button
              onClick={handleClearAll}
              className={`text-sm px-3 py-1.5 rounded transition-colors ${
                confirmClear
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'text-gray-500 hover:text-red-500 hover:bg-red-50'
              }`}
            >
              {confirmClear ? '本当に全削除する' : '全履歴を削除'}
            </button>
            {confirmClear && (
              <button
                onClick={() => setConfirmClear(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                キャンセル
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionHistoryPanel;
