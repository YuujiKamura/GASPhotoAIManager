import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, MessageCircle, Check, ChevronRight, Loader2, Brain } from 'lucide-react';
import { AIAnalysisResult, PhotoRecord } from '../../types';
import { useInteractiveAnalysis } from './useInteractiveAnalysis';
import { AnalysisBackend } from '../../services/analysisBackend';
import { TRANSLATIONS, DialogChoice } from './types';

interface InteractiveAnalysisDialogProps {
  photo: PhotoRecord | null;
  apiKey: string;
  backend: AnalysisBackend | null;
  lang?: 'ja' | 'en';
  onConfirm: (fileName: string, analysis: AIAnalysisResult) => void;
  onRequireBackend?: () => void;
  onClose: () => void;
}

export const InteractiveAnalysisDialog: React.FC<InteractiveAnalysisDialogProps> = ({
  photo,
  apiKey,
  backend,
  lang = 'ja',
  onConfirm,
  onRequireBackend,
  onClose,
}) => {
  const txt = TRANSLATIONS[lang];
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    state,
    openDialog,
    closeDialog,
    sendMessage,
    selectChoice,
    acceptAnalysis,
    setInputText,
    toggleTextInput,
  } = useInteractiveAnalysis(apiKey, backend, onConfirm, onRequireBackend);

  // 写真が設定されたらダイアログを開く
  useEffect(() => {
    if (photo) {
      openDialog(photo);
    }
  }, [photo]);

  // メッセージが追加されたらスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, state.streamingText]);

  // 閉じる処理
  const handleClose = () => {
    closeDialog();
    onClose();
  };

  // 確定して閉じる
  const handleAccept = () => {
    acceptAnalysis();
    onClose();
  };

  // テキスト送信
  const handleSend = () => {
    if (state.inputText.trim()) {
      sendMessage(state.inputText);
    }
  };

  // キー入力
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!state.isOpen || !state.targetPhoto) return null;

  const analysis = state.currentAnalysis;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-700">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-800 to-emerald-900 border-b border-emerald-700">
          <div className="flex items-center gap-2 text-emerald-100">
            <MessageCircle className="w-5 h-5" />
            <span className="font-medium">{txt.title}</span>
            <span className="text-emerald-300 text-sm">- {state.targetPhoto.fileName}</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-emerald-700/50 rounded transition-colors text-emerald-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* メインコンテンツ */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左側: 写真 + 解析結果 */}
          <div className="w-1/3 flex flex-col border-r border-gray-700 bg-gray-800">
            {/* 写真プレビュー */}
            <div className="p-3 border-b border-gray-700">
              <img
                src={state.targetPhoto.base64}
                alt={state.targetPhoto.fileName}
                className="w-full h-48 object-contain rounded bg-black"
              />
            </div>

            {/* 解析結果 */}
            <div className="flex-1 overflow-auto p-3">
              <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                <Brain className="w-3 h-3" />
                解析結果
              </div>
              {state.isProcessing ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  解析中...
                </div>
              ) : analysis ? (
                <div className="space-y-1 text-sm">
                  <InfoField label={txt.workType} value={analysis.workType} />
                  <InfoField label={txt.variety} value={analysis.variety || ''} />
                  <InfoField label={txt.detail} value={analysis.detail || ''} />
                  <InfoField label={txt.station} value={analysis.station} />
                  <InfoField label={txt.remarks} value={analysis.remarks} />
                  {analysis.measurements && (
                    <InfoField label={txt.measurements} value={analysis.measurements} multiline />
                  )}
                  {analysis.detectedText && (
                    <div className="mt-2 pt-2 border-t border-gray-600">
                      <div className="text-gray-500 text-xs mb-1">黒板テキスト:</div>
                      <div className="text-gray-300 text-xs whitespace-pre-wrap">{analysis.detectedText}</div>
                    </div>
                  )}
                  {state.rawResponse && (
                    <div className="mt-2 pt-2 border-t border-gray-600">
                      <div className="text-gray-500 text-xs mb-1">Gemini回答（生）:</div>
                      <div className="text-gray-200 text-xs whitespace-pre-wrap">{state.rawResponse}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">{txt.noAnalysis}</div>
              )}
            </div>
          </div>

          {/* 右側: 対話エリア */}
          <div className="flex-1 flex flex-col bg-gray-900">
            {/* メッセージ履歴 */}
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {state.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-gray-700 text-gray-100'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    {msg.reasoning && (
                      <div className="mt-2 pt-2 border-t border-gray-600 text-xs text-gray-400">
                        <span className="text-emerald-400">根拠: </span>
                        {msg.reasoning}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* ストリーミング中のテキスト */}
              {state.isStreaming && state.streamingText && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] px-4 py-2 rounded-lg bg-gray-700 text-gray-100">
                    <div className="whitespace-pre-wrap">{state.streamingText}</div>
                  </div>
                </div>
              )}

              {/* 処理中インジケータ */}
              {state.isProcessing && !state.streamingText && (
                <div className="flex justify-start">
                  <div className="px-4 py-2 rounded-lg bg-gray-700 text-gray-400 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {txt.analyzing}
                  </div>
                </div>
              )}

              {/* エラー表示 */}
              {state.error && (
                <div className="flex justify-center">
                  <div className="px-4 py-2 rounded-lg bg-red-900/50 text-red-300 text-sm">
                    {state.error}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* 選択肢 */}
            {!state.isProcessing && state.currentChoices.length > 0 && !state.showTextInput && (
              <div className="px-4 pb-3 flex flex-wrap gap-2">
                {state.currentChoices.map((choice) => (
                  <ChoiceButton
                    key={choice.id}
                    choice={choice}
                    onClick={() => selectChoice(choice)}
                  />
                ))}
              </div>
            )}

            {/* テキスト入力 */}
            {state.showTextInput && (
              <div className="px-4 pb-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={state.inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={txt.placeholder}
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSend}
                    disabled={!state.inputText.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    onClick={toggleTextInput}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-t border-gray-700">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            {txt.close}
          </button>
          <button
            onClick={handleAccept}
            disabled={!analysis || state.isProcessing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            {txt.confirmCurrent}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// 解析結果フィールド表示
const InfoField: React.FC<{ label: string; value: string; multiline?: boolean }> = ({
  label,
  value,
  multiline,
}) => (
  <div className={`flex ${multiline ? 'flex-col' : 'items-center'} gap-1`}>
    <span className="text-gray-500 text-xs w-12 flex-shrink-0">{label}</span>
    <span className={`text-gray-200 ${multiline ? 'text-xs' : ''}`}>{value || '-'}</span>
  </div>
);

// 選択肢ボタン
const ChoiceButton: React.FC<{ choice: DialogChoice; onClick: () => void }> = ({
  choice,
  onClick,
}) => {
  const isAccept = choice.action === 'accept';
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
        isAccept
          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
          : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
      }`}
    >
      {choice.label}
    </button>
  );
};
