import React, { useState, useEffect } from 'react';
import { X, Trash2, Star, Loader2, Check, Plus, FolderOpen, Image } from 'lucide-react';
import { AnalysisSession, PhotoRecord } from '../types';
import {
  getSessions,
  deleteSession,
  clearSessions,
  saveCurrentSessionAsExample,
  setActiveSession,
  getActiveSessionId,
  clearActiveSession
} from '../utils/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lang: 'en' | 'ja';
  currentPhotos?: PhotoRecord[]; // 現在のセッションの写真（保存用）
}

const ExamplesModal: React.FC<Props> = ({ isOpen, onClose, lang, currentPhotos = [] }) => {
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSessions();
      setActiveSessionIdState(getActiveSessionId());
    }
  }, [isOpen]);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const data = await getSessions();
      setSessions(data);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCurrentSession = async () => {
    if (!newSessionName.trim()) {
      alert(lang === 'ja' ? 'セッション名を入力してください' : 'Please enter a session name');
      return;
    }

    const analyzedCount = currentPhotos.filter(p => p.analysis && p.status === 'done').length;
    if (analyzedCount === 0) {
      alert(lang === 'ja' ? '解析済みの写真がありません' : 'No analyzed photos');
      return;
    }

    setIsSaving(true);
    try {
      const session = await saveCurrentSessionAsExample(currentPhotos, newSessionName.trim());
      setSessions(prev => [session, ...prev]);
      setNewSessionName('');
      setShowSaveForm(false);
      alert(lang === 'ja' ? `${analyzedCount}枚のお手本を保存しました` : `Saved ${analyzedCount} examples`);
    } catch (e) {
      console.error('Failed to save session:', e);
      alert(lang === 'ja' ? '保存に失敗しました' : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    if (activeSessionId === sessionId) {
      // すでにアクティブなら解除
      clearActiveSession();
      setActiveSessionIdState(null);
    } else {
      // 新しくアクティブに
      setActiveSession(sessionId);
      setActiveSessionIdState(sessionId);
    }
  };

  const handleDelete = async (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (!confirm(lang === 'ja'
      ? `「${session?.name}」を削除しますか？`
      : `Delete "${session?.name}"?`)) {
      return;
    }

    try {
      await deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionIdState(null);
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  };

  const handleClearAll = async () => {
    if (!confirm(lang === 'ja' ? '全てのお手本セッションを削除しますか？' : 'Delete all example sessions?')) {
      return;
    }

    try {
      await clearSessions();
      setSessions([]);
      setActiveSessionIdState(null);
    } catch (e) {
      console.error('Failed to clear sessions:', e);
    }
  };

  const analyzedPhotoCount = currentPhotos.filter(p => p.analysis && p.status === 'done').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-t-xl">
          <div className="flex items-center gap-2">
            <Star className="w-6 h-6" />
            <h2 className="text-xl font-bold">
              {lang === 'ja' ? 'お手本セッション' : 'Example Sessions'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Active Session Banner */}
        {activeSessionId && (
          <div className="px-4 py-2 bg-green-100 border-b border-green-200 flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-800 font-medium">
              {lang === 'ja' ? 'お手本適用中: ' : 'Active: '}
              {sessions.find(s => s.id === activeSessionId)?.name || '...'}
            </span>
            <button
              onClick={() => handleSelectSession(activeSessionId)}
              className="ml-auto text-xs text-green-700 hover:text-green-900 underline"
            >
              {lang === 'ja' ? '解除' : 'Deactivate'}
            </button>
          </div>
        )}

        {/* Save Current Session */}
        <div className="p-4 border-b bg-gray-50">
          {showSaveForm ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder={lang === 'ja' ? 'セッション名（例: A工区 舗装工事）' : 'Session name'}
                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500"
                autoFocus
              />
              <button
                onClick={handleSaveCurrentSession}
                disabled={isSaving || !newSessionName.trim()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-1"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {lang === 'ja' ? '保存' : 'Save'}
              </button>
              <button
                onClick={() => { setShowSaveForm(false); setNewSessionName(''); }}
                className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveForm(true)}
              disabled={analyzedPhotoCount === 0}
              className="w-full px-4 py-3 border-2 border-dashed border-amber-400 hover:border-amber-500 hover:bg-amber-50 rounded-lg text-amber-700 font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5" />
              {lang === 'ja'
                ? `現在のセッションをお手本として保存（${analyzedPhotoCount}枚）`
                : `Save current session as example (${analyzedPhotoCount} photos)`}
            </button>
          )}
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">
                {lang === 'ja' ? '保存されたセッションがありません' : 'No saved sessions'}
              </p>
              <p className="text-sm mt-2">
                {lang === 'ja'
                  ? '解析完了後、上のボタンで保存できます'
                  : 'Save after analysis using the button above'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className={`border rounded-lg overflow-hidden transition-all ${
                    activeSessionId === session.id
                      ? 'ring-2 ring-green-500 bg-green-50'
                      : 'hover:shadow-md bg-white'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-800 truncate flex items-center gap-2">
                          {session.name}
                          {activeSessionId === session.id && (
                            <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
                              {lang === 'ja' ? '適用中' : 'Active'}
                            </span>
                          )}
                        </h3>
                        <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Image className="w-4 h-4" />
                            {session.photoCount}枚
                          </span>
                          <span>
                            {new Date(session.createdAt).toLocaleDateString('ja-JP')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleSelectSession(session.id)}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            activeSessionId === session.id
                              ? 'bg-green-500 text-white hover:bg-green-600'
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          }`}
                        >
                          {activeSessionId === session.id
                            ? (lang === 'ja' ? '解除' : 'Deactivate')
                            : (lang === 'ja' ? '適用' : 'Apply')}
                        </button>
                        <button
                          onClick={() => handleDelete(session.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                          title={lang === 'ja' ? '削除' : 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Thumbnail preview */}
                    <div className="mt-3 flex gap-1 overflow-hidden">
                      {session.examples.slice(0, 6).map((ex, i) => (
                        <div key={i} className="w-12 h-12 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                          <img src={ex.thumbnail} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {session.examples.length > 6 && (
                        <div className="w-12 h-12 flex-shrink-0 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500 font-medium">
                          +{session.examples.length - 6}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {lang === 'ja'
              ? 'お手本セッションを適用すると、次回解析時にAIの参考例として使用されます'
              : 'Applied sessions will be used as AI reference examples'}
          </p>
          {sessions.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-xs text-red-500 hover:text-red-700"
            >
              {lang === 'ja' ? '全削除' : 'Clear All'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamplesModal;
