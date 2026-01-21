/**
 * 解析進捗の通知フック
 *
 * - ブラウザタブのタイトルに進捗を表示
 * - 解析完了時にデスクトップ通知
 */

import { useEffect, useRef, useCallback } from 'react';

interface UseProgressNotificationProps {
  isProcessing: boolean;
  processedCount: number;
  totalCount: number;
  appTitle?: string;
}

const DEFAULT_TITLE = 'GASPhotoAIManager';

export function useProgressNotification({
  isProcessing,
  processedCount,
  totalCount,
  appTitle = DEFAULT_TITLE,
}: UseProgressNotificationProps) {
  const originalTitleRef = useRef(document.title);
  const wasProcessingRef = useRef(false);
  const notificationPermissionRef = useRef<NotificationPermission>('default');

  // 通知権限をリクエスト
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      notificationPermissionRef.current = 'granted';
      return;
    }
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      notificationPermissionRef.current = permission;
    }
  }, []);

  // 解析開始時に通知権限をリクエスト
  useEffect(() => {
    if (isProcessing && !wasProcessingRef.current) {
      requestNotificationPermission();
    }
  }, [isProcessing, requestNotificationPermission]);

  // タイトル更新
  useEffect(() => {
    if (isProcessing && totalCount > 0) {
      const percent = Math.round((processedCount / totalCount) * 100);
      document.title = `[${percent}%] ${processedCount}/${totalCount}枚 - ${appTitle}`;
    } else {
      document.title = appTitle;
    }

    return () => {
      document.title = appTitle;
    };
  }, [isProcessing, processedCount, totalCount, appTitle]);

  // 解析完了時の通知
  useEffect(() => {
    // 解析中 → 解析完了 の遷移を検出
    if (wasProcessingRef.current && !isProcessing && totalCount > 0) {
      // デスクトップ通知
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('解析完了', {
          body: `${processedCount}/${totalCount}枚の解析が完了しました`,
          icon: '/favicon.ico',
          tag: 'analysis-complete', // 同じタグの通知は上書き
        });
      }
    }
    wasProcessingRef.current = isProcessing;
  }, [isProcessing, processedCount, totalCount]);

  return { requestNotificationPermission };
}
