import React, { useState, useRef, useCallback } from 'react';

type DialogState = 'select-pdf' | 'analyzing' | 'need-folder' | 'loading';

interface PdfLoadDialogState {
  state: DialogState;
  pdfFile: File | null;
  imageFolder: FileSystemDirectoryHandle | null;
  folderName: string;
  logs: string[];
}

interface PdfLoadDialogActions {
  handlePdfSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleFolderSelect: () => Promise<void>;
  handleClose: () => void;
  pushLog: (msg: string) => void;
}

interface PdfLoadDialogRefs {
  pdfInputRef: React.RefObject<HTMLInputElement>;
}

type OnLoadFn = (
  pdfFile: File,
  imageFolder: FileSystemDirectoryHandle | null,
  pushLog?: (msg: string) => void
) => Promise<void>;

export function usePdfLoadDialog(
  onLoad: OnLoadFn,
  onClose: () => void
): PdfLoadDialogState & PdfLoadDialogActions & PdfLoadDialogRefs {
  const [state, setState] = useState<DialogState>('select-pdf');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [imageFolder, setImageFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const pushLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, msg]);
  }, []);

  const resetState = useCallback(() => {
    setPdfFile(null);
    setImageFolder(null);
    setFolderName('');
    setLogs([]);
    setState('select-pdf');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handlePdfSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFile(file);
    setLogs([`PDF: ${file.name}`]);
    setState('analyzing');

    try {
      pushLog('PDFを解析中...');

      // Dynamic import of pdfGenerator to avoid loading heavy PDF libraries upfront
      const { isSmartPdf, hasIndividualImages } = await import('../utils/pdfGenerator');

      const isSmart = await isSmartPdf(file);
      const hasImages = await hasIndividualImages(file);

      if (isSmart && hasImages) {
        // 新形式スマートPDF: 個別画像埋め込み済み → フォルダ不要
        pushLog('新形式PDF: 画像＋キャプション埋め込み済み');
        setState('loading');
        try {
          await onLoad(file, null, pushLog);
          pushLog('読み込み完了');
          handleClose();
        } catch (err: any) {
          pushLog(`エラー: ${err.message}`);
          // 失敗したらフォルダ選択へフォールバック
          pushLog('フォルダから画像を読み込みます');
          setState('need-folder');
        }
      } else {
        // 旧形式PDF: フォルダが必要
        pushLog(isSmart ? '旧形式スマートPDF: 画像はフォルダから' : '旧形式PDF');
        pushLog('画像フォルダを選択してください');
        setState('need-folder');
      }
    } catch (err: any) {
      console.error('PDF analysis failed:', err);
      alert(err.message || 'Unknown error');
      setState('select-pdf');
    }
  }, [onLoad, pushLog, handleClose]);

  const handleFolderSelect = useCallback(async () => {
    try {
      const handle = await window.showDirectoryPicker();
      console.log('[PdfLoadDialog] Folder selected:', handle.name);
      setImageFolder(handle);
      setFolderName(handle.name);
      pushLog(`フォルダ選択: ${handle.name}`);

      // フォルダ選択したら即読み込み
      if (pdfFile) {
        console.log('[PdfLoadDialog] Starting load...');
        setState('loading');
        try {
          console.log('[PdfLoadDialog] Calling onLoad...');
          await onLoad(pdfFile, handle, pushLog);
          console.log('[PdfLoadDialog] onLoad completed!');
          pushLog('読み込み完了');
          handleClose();
        } catch (err: any) {
          console.error('[PdfLoadDialog] onLoad error:', err);
          alert(err.message || 'Load failed');
          setState('select-pdf');
        }
      }
    } catch (err) {
      console.log('[PdfLoadDialog] Folder selection cancelled');
    }
  }, [pdfFile, onLoad, pushLog, handleClose]);

  return {
    state,
    pdfFile,
    imageFolder,
    folderName,
    logs,
    handlePdfSelect,
    handleFolderSelect,
    handleClose,
    pushLog,
    pdfInputRef
  };
}
