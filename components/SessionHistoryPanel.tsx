import React, { useState, useEffect } from 'react';
import { History, Trash2, X, Calendar, Image, FileText, Star, Check, Edit2 } from 'lucide-react';
import { AnalysisHistoryEntry } from '../types';
import {
  getAnalysisHistory,
  deleteAnalysisHistory,
  clearAnalysisHistory,
  toggleHistoryAsExample,
  updateHistoryName,
  getActiveExampleHistoryId,
  setActiveExampleHistory
} from '../utils/storage';

interface Props {
  onLoad: (entry: AnalysisHistoryEntry) => void;
  onClose: () => void;
}

const SessionHistoryPanel: React.FC<Props> = ({ onLoad, onClose }) => {
  const [entries, setEntries] = useState<AnalysisHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [activeExampleId, setActiveExampleId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    loadHistory();
    setActiveExampleId(getActiveExampleHistoryId());
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
      if (activeExampleId === id) {
        setActiveExampleHistory(null);
        setActiveExampleId(null);
      }
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
      setActiveExampleHistory(null);
      setActiveExampleId(null);
    } catch (e) {
      console.error('Failed to clear:', e);
    }
  };

  const handleToggleExample = async (entry: AnalysisHistoryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !entry.isExampleSession;

    try {
      const updated = await toggleHistoryAsExample(entry.id, newState);
      if (updated) {
        setEntries(prev => prev.map(e => e.id === entry.id ? updated : e));

        // お手本に設定したらアクティブに
        if (newState) {
          setActiveExampleHistory(entry.id);
          setActiveExampleId(entry.id);
        } else if (activeExampleId === entry.id) {
          // お手本解除でアクティブだった場合はクリア
          setActiveExampleHistory(null);
          setActiveExampleId(null);
        }
      }
    } catch (e) {
      console.error('Failed to toggle example:', e);
    }
  };

  const handleSetActive = async (entry: AnalysisHistoryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry.isExampleSession) return;

    if (activeExampleId === entry.id) {
      // 解除
      setActiveExampleHistory(null);
      setActiveExampleId(null);
    } else {
      // 設定
      setActiveExampleHistory(entry.id);
      setActiveExampleId(entry.id);
    }
  };

  const handleStartEdit = (entry: AnalysisHistoryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(entry.id);
    setEditName(entry.name || '');
  };

  const handleSaveName = async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await updateHistoryName(id, editName.trim());
      setEntries(prev => prev.map(e => e.id === id ? { ...e, name: editName.trim() } : e));
    } catch (e) {
      console.error('Failed to update name:', e);
    }
    setEditingId(null);
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

  const exampleCount = entries.filter(e => e.isExampleSession).length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5" />
            <h3 className="font-bold text-lg">解析履歴</h3>
            <span className="text-purple-200 text-sm">({entries.length}件)</span>
            {exampleCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-amber-400 text-amber-900 text-xs rounded-full flex items-center gap-1">
                <Star className="w-3 h-3" />
                お手本 {exampleCount}件
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Example Banner */}
        {activeExampleId && (
          <div className="px-4 py-2 bg-amber-100 border-b border-amber-200 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-600 fill-amber-600" />
            <span className="text-sm text-amber-800 font-medium">
              お手本適用中: {entries.find(e => e.id === activeExampleId)?.name || '...'}
            </span>
            <button
              onClick={() => {
                setActiveExampleHistory(null);
                setActiveExampleId(null);
              }}
              className="ml-auto text-xs text-amber-700 hover:text-amber-900 underline"
            >
              解除
            </button>
          </div>
        )}

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
                  className={`group border rounded-lg p-3 cursor-pointer transition-all ${
                    entry.isExampleSession
                      ? activeExampleId === entry.id
                        ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-300'
                        : 'border-amber-300 bg-amber-50/50 hover:border-amber-400'
                      : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Thumbnails */}
                    {entry.thumbnails && entry.thumbnails.length > 0 && (
                      <div className="flex-shrink-0 flex gap-0.5">
                        {entry.thumbnails.slice(0, 3).map((thumb, i) => (
                          <div key={i} className="w-10 h-10 bg-gray-100 rounded overflow-hidden">
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        {entry.photoCount > 3 && (
                          <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">
                            +{entry.photoCount - 3}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Name / Date */}
                      <div className="flex items-center gap-2">
                        {editingId === entry.id ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => handleSaveName(entry.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveName(entry.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-purple-500"
                            autoFocus
                          />
                        ) : (
                          <>
                            <span className="font-medium text-gray-800 truncate">
                              {entry.name || formatFullDate(entry.createdAt)}
                            </span>
                            <button
                              onClick={(e) => handleStartEdit(entry, e)}
                              className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="名前を編集"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            {entry.isExampleSession && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-400 text-amber-900 text-xs rounded">
                                <Star className="w-3 h-3 fill-amber-900" />
                                お手本
                              </span>
                            )}
                            {activeExampleId === entry.id && (
                              <span className="px-1.5 py-0.5 bg-green-500 text-white text-xs rounded">
                                適用中
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Date (if name is different) */}
                      {entry.name && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          <span>{formatFullDate(entry.createdAt)}</span>
                        </div>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
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

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-1">
                      {/* Toggle Example */}
                      <button
                        onClick={(e) => handleToggleExample(entry, e)}
                        className={`p-2 rounded-lg transition-all ${
                          entry.isExampleSession
                            ? 'bg-amber-400 text-amber-900 hover:bg-amber-500'
                            : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'
                        }`}
                        title={entry.isExampleSession ? 'お手本を解除' : 'お手本に設定'}
                      >
                        <Star className={`w-4 h-4 ${entry.isExampleSession ? 'fill-amber-900' : ''}`} />
                      </button>

                      {/* Apply/Deactivate (only for examples) */}
                      {entry.isExampleSession && (
                        <button
                          onClick={(e) => handleSetActive(entry, e)}
                          className={`p-2 rounded-lg transition-all ${
                            activeExampleId === entry.id
                              ? 'bg-green-500 text-white hover:bg-green-600'
                              : 'text-gray-400 hover:text-green-500 hover:bg-green-50'
                          }`}
                          title={activeExampleId === entry.id ? '適用を解除' : '適用する'}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={(e) => handleDelete(entry.id, e)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50 rounded-b-2xl">
          <div className="flex justify-between items-center">
            <div className="text-xs text-gray-500">
              <Star className="w-3 h-3 inline mr-1 text-amber-500" />
              お手本に設定すると次回解析時にAIの参考例として使用されます
            </div>
            {entries.length > 0 && (
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
            )}
            {confirmClear && (
              <button
                onClick={() => setConfirmClear(false)}
                className="ml-2 text-sm text-gray-500 hover:text-gray-700"
              >
                キャンセル
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionHistoryPanel;
