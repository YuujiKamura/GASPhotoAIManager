import { useState, useCallback, useRef } from 'react';
import { PhotoRecord, AIAnalysisResult } from '../../types';
import {
  InteractiveAnalysisState,
  UseInteractiveAnalysisReturn,
  DialogMessage,
  DialogChoice,
  DEFAULT_CHOICES,
  INITIAL_STATE,
} from './types';
import { analyzePhotoInteractive } from '../../services/geminiService';
import { AnalysisBackend } from '../../services/analysisBackend';

export const useInteractiveAnalysis = (
  apiKey: string,
  backend: AnalysisBackend | null,
  onConfirm: (fileName: string, analysis: AIAnalysisResult) => void,
  onRequireBackend?: () => void,
  onRequireApiKey?: () => void,
  onLog?: (message: string, type?: string) => void
): UseInteractiveAnalysisReturn => {
  const [state, setState] = useState<InteractiveAnalysisState>(INITIAL_STATE);
  const abortRef = useRef(false);
  const conversationRef = useRef<DialogMessage[]>([]);

  // ダイアログを開く
  const openDialog = useCallback(async (photo: PhotoRecord) => {
    if (backend !== 'gemini') {
      if (onRequireBackend) {
        onRequireBackend();
        return;
      }
      setState(prev => ({
        ...prev,
        isOpen: true,
        targetPhoto: photo,
        isProcessing: false,
        error: '対話型解析はGeminiモードでのみ利用できます。',
      }));
      return;
    }
    abortRef.current = false;
    conversationRef.current = [];

    setState({
      ...INITIAL_STATE,
      isOpen: true,
      targetPhoto: photo,
      isProcessing: true,
      currentAnalysis: photo.analysis || null,
    });

    // 初期解析を開始
    try {
      const result = await analyzePhotoInteractive(
        photo,
        [],
        apiKey,
        (streamText) => {
          setState(prev => ({
            ...prev,
            streamingText: streamText,
            isStreaming: true,
          }));
        },
        () => abortRef.current
      );

      if (abortRef.current) return;

      // AIメッセージを追加
      const aiMessage: DialogMessage = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: result.response,
        timestamp: Date.now(),
        reasoning: result.analysis?.reasoning,
      };
      conversationRef.current.push(aiMessage);

      const newAnalysis = result.analysis || null;

      setState(prev => ({
        ...prev,
        isProcessing: false,
        isStreaming: false,
        streamingText: '',
        rawResponse: result.rawResponse || result.response,
        messages: [...conversationRef.current],
        currentAnalysis: newAnalysis || prev.currentAnalysis,
        currentChoices: DEFAULT_CHOICES,
      }));

      // 解析結果があれば自動反映（OKを待たない）
      if (newAnalysis) {
        onConfirm(photo.fileName, newAnalysis);
      }
    } catch (error: any) {
      if (!abortRef.current) {
        setState(prev => ({
          ...prev,
          isProcessing: false,
          isStreaming: false,
          error: error.message || '解析中にエラーが発生しました',
        }));
      }
    }
  }, [apiKey, onConfirm, backend, onRequireBackend]);

  // ダイアログを閉じる
  const closeDialog = useCallback(() => {
    abortRef.current = true;
    setState(INITIAL_STATE);
    conversationRef.current = [];
  }, []);

  // メッセージ送信
  const sendMessage = useCallback(async (text: string) => {
    if (!state.targetPhoto || !text.trim()) return;
    if (backend !== 'gemini') {
      if (onRequireBackend) {
        onRequireBackend();
        return;
      }
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isStreaming: false,
        error: '対話型解析はGeminiモードでのみ利用できます。',
      }));
      return;
    }

    // ユーザーメッセージを追加
    const userMessage: DialogMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    conversationRef.current.push(userMessage);

    setState(prev => ({
      ...prev,
      messages: [...conversationRef.current],
      isProcessing: true,
      inputText: '',
      showTextInput: false,
    }));

    try {
      const result = await analyzePhotoInteractive(
        state.targetPhoto,
        conversationRef.current,
        apiKey,
        (streamText) => {
          setState(prev => ({
            ...prev,
            streamingText: streamText,
            isStreaming: true,
          }));
        },
        () => abortRef.current
      );

      if (abortRef.current) return;

      // AIメッセージを追加
      const aiMessage: DialogMessage = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: result.response,
        timestamp: Date.now(),
        reasoning: result.analysis?.reasoning,
      };
      conversationRef.current.push(aiMessage);

      const newAnalysis = result.analysis || null;

      setState(prev => ({
        ...prev,
        isProcessing: false,
        isStreaming: false,
        streamingText: '',
        rawResponse: result.rawResponse || result.response,
        messages: [...conversationRef.current],
        currentAnalysis: newAnalysis || prev.currentAnalysis,
        currentChoices: DEFAULT_CHOICES,
      }));

      // 解析結果があれば自動反映（OKを待たない）
      if (newAnalysis && state.targetPhoto) {
        onConfirm(state.targetPhoto.fileName, newAnalysis);
      }
    } catch (error: any) {
      if (!abortRef.current) {
        setState(prev => ({
          ...prev,
          isProcessing: false,
          isStreaming: false,
          error: error.message || '処理中にエラーが発生しました',
        }));
      }
    }
  }, [state.targetPhoto, apiKey, onConfirm, backend, onRequireBackend]);

  // 選択肢を選択
  const selectChoice = useCallback(async (choice: DialogChoice) => {
    if (choice.action === 'accept') {
      // 確定
      if (state.targetPhoto && state.currentAnalysis) {
        onConfirm(state.targetPhoto.fileName, state.currentAnalysis);
      }
      closeDialog();
      return;
    }

    if (choice.action === 'custom') {
      // テキスト入力モードへ
      setState(prev => ({ ...prev, showTextInput: true }));
      return;
    }

    // 修正リクエスト
    let prompt = '';
    switch (choice.action) {
      case 'modify_workType':
        prompt = '工種・種別・細別を修正したい。正しい値を教えてほしい。';
        break;
      case 'modify_station':
        prompt = '測点が違う。正しい測点を指定したい。';
        break;
      case 'modify_remarks':
        prompt = '備考の内容を修正したい。';
        break;
      case 'retry':
        prompt = 'もう一度最初から解析してほしい。';
        break;
      default:
        prompt = choice.label;
    }

    await sendMessage(prompt);
  }, [state.targetPhoto, state.currentAnalysis, onConfirm, closeDialog, sendMessage]);

  // 解析結果を確定
  const acceptAnalysis = useCallback(() => {
    if (state.targetPhoto && state.currentAnalysis) {
      onConfirm(state.targetPhoto.fileName, state.currentAnalysis);
    }
    closeDialog();
  }, [state.targetPhoto, state.currentAnalysis, onConfirm, closeDialog]);

  // テキスト入力
  const setInputText = useCallback((text: string) => {
    setState(prev => ({ ...prev, inputText: text }));
  }, []);

  // テキスト入力モード切替
  const toggleTextInput = useCallback(() => {
    setState(prev => ({ ...prev, showTextInput: !prev.showTextInput }));
  }, []);

  return {
    state,
    openDialog,
    closeDialog,
    sendMessage,
    selectChoice,
    acceptAnalysis,
    setInputText,
    toggleTextInput,
  };
};
