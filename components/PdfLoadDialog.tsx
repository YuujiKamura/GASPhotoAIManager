import React, { useState, useRef } from 'react';
import { FileText, FolderOpen, Loader2, AlertTriangle, X, Upload } from 'lucide-react';
// pdfGenerator is dynamically imported when needed to avoid loading heavy PDF libraries upfront

interface PdfLoadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (
    pdfFile: File,
    imageFolder: FileSystemDirectoryHandle | null,
    pushLog?: (msg: string) => void
  ) => Promise<void>;
  lang: 'en' | 'ja';
}

type DialogState = 'select-pdf' | 'analyzing' | 'need-folder' | 'loading';

const PdfLoadDialog: React.FC<PdfLoadDialogProps> = ({ isOpen, onClose, onLoad, lang }) => {
  const [state, setState] = useState<DialogState>('select-pdf');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [imageFolder, setImageFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const txt = {
    title: lang === 'ja' ? 'PDF読み込み' : 'Load PDF',
    selectPdf: lang === 'ja' ? 'PDFファイルを選択' : 'Select PDF File',
    analyzing: lang === 'ja' ? '解析中...' : 'Analyzing...',
    loading: lang === 'ja' ? '読み込み中...' : 'Loading...',
    legacyPdf: lang === 'ja' ? '旧形式PDF' : 'Legacy PDF',
    needFolder: lang === 'ja' ? '元画像フォルダを選択してください' : 'Please select the original image folder',
    selectFolder: lang === 'ja' ? 'フォルダを選択' : 'Select Folder',
    folderSelected: lang === 'ja' ? '選択済み' : 'Selected',
    close: lang === 'ja' ? '閉じる' : 'Close',
  };

  const handlePdfSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  // checkSmartPdf removed - use isSmartPdf from pdfGenerator instead

  const handleFolderSelect = async () => {
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
  };

  const handleClose = () => {
    setPdfFile(null);
    setImageFolder(null);
    setFolderName('');
    setLogs([]);
    setState('select-pdf');
    onClose();
  };

  const pushLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            {txt.title}
          </h2>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6">
          {/* PDF選択 */}
          {state === 'select-pdf' && (
            <div>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                onChange={handlePdfSelect}
                className="hidden"
              />
              <button
                onClick={() => pdfInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <Upload className="w-6 h-6 text-gray-400" />
                <span className="text-gray-600">{txt.selectPdf}</span>
              </button>
            </div>
          )}

          {/* 解析中 / 読み込み中 */}
          {(state === 'analyzing' || state === 'loading') && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="text-gray-600">
                {state === 'analyzing' ? txt.analyzing : txt.loading}
              </span>
            </div>
          )}

          {/* 旧形式: フォルダ選択が必要 */}
          {state === 'need-folder' && pdfFile && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <FileText className="w-5 h-5 text-gray-500" />
                <span className="text-sm text-gray-700 truncate flex-1">{pdfFile.name}</span>
              </div>

              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-amber-800">{txt.legacyPdf}</div>
                  <div className="text-sm text-amber-600 mt-1">{txt.needFolder}</div>
                </div>
              </div>

              <button
                onClick={handleFolderSelect}
                className="w-full flex items-center justify-center gap-3 p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors"
              >
                <FolderOpen className="w-5 h-5" />
                <span>{txt.selectFolder}</span>
              </button>
            </div>
          )}

        </div>

        {/* ログ表示 */}
        {logs.length > 0 && (
          <div className="px-6 pb-4">
            <div className="text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-32 overflow-y-auto text-gray-700 space-y-1">
              {logs.map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
          </div>
        )}

        {/* フッター */}
        {state === 'need-folder' && (
          <div className="flex justify-end p-4 border-t bg-gray-50 rounded-b-xl">
            <button
              onClick={handleClose}
              className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
            >
              {txt.close}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfLoadDialog;
