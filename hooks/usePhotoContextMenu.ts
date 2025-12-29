import { useState, useEffect } from 'react';
import { PhotoRecord, AIAnalysisResult, IssueType } from '../types';
import { saveExample, saveAnalysisIssue } from '../utils/storage';

export interface ContextMenuState {
  x: number;
  y: number;
  targetFileName: string;
}

export interface ReasoningModalState {
  fileName: string;
  reasoning: string;
  analysis: AIAnalysisResult;
}

export interface IssueModalState {
  record: PhotoRecord;
}

interface UsePhotoContextMenuProps {
  records: PhotoRecord[];
  lang: 'en' | 'ja';
  onDeletePhoto?: (fileName: string) => void;
  onReanalyzePhoto?: (fileName: string) => void;
  txt: { issueSaved: string };
}

export function usePhotoContextMenu({ records, lang, onDeletePhoto, onReanalyzePhoto, txt }: UsePhotoContextMenuProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isSavingExample, setIsSavingExample] = useState(false);
  const [reasoningModal, setReasoningModal] = useState<ReasoningModalState | null>(null);
  const [issueModal, setIssueModal] = useState<IssueModalState | null>(null);
  const [issueDescription, setIssueDescription] = useState('');
  const [issueType, setIssueType] = useState<IssueType>('wrong_classification');
  const [isSavingIssue, setIsSavingIssue] = useState(false);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('resize', handleClickOutside);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('resize', handleClickOutside);
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent, fileName: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, targetFileName: fileName });
  };

  const closeContextMenu = () => setContextMenu(null);

  const executeDelete = () => {
    if (contextMenu && onDeletePhoto) {
      onDeletePhoto(contextMenu.targetFileName);
      setContextMenu(null);
    }
  };

  const executeReanalyze = () => {
    if (contextMenu && onReanalyzePhoto) {
      onReanalyzePhoto(contextMenu.targetFileName);
      setContextMenu(null);
    }
  };

  const executeSaveAsExample = async () => {
    if (!contextMenu) return;
    const record = records.find(r => r.fileName === contextMenu.targetFileName);
    if (!record?.analysis) {
      alert(lang === 'ja' ? '解析結果がありません' : 'No analysis result');
      setContextMenu(null);
      return;
    }

    setIsSavingExample(true);
    try {
      const exampleName = prompt(
        lang === 'ja' ? 'お手本の名前を入力してください:' : 'Enter a name for this example:',
        `${record.analysis.workType || ''} - ${record.analysis.remarks || record.fileName}`
      );
      if (exampleName) {
        await saveExample(record, exampleName);
        alert(lang === 'ja' ? 'お手本として保存しました' : 'Saved as example');
      }
    } catch (e) {
      console.error('Failed to save example:', e);
      alert(lang === 'ja' ? '保存に失敗しました' : 'Failed to save');
    } finally {
      setIsSavingExample(false);
      setContextMenu(null);
    }
  };

  const executeShowReasoning = () => {
    if (!contextMenu) return;
    const record = records.find(r => r.fileName === contextMenu.targetFileName);
    if (!record?.analysis) {
      alert(lang === 'ja' ? '解析結果がありません' : 'No analysis result');
      setContextMenu(null);
      return;
    }
    setReasoningModal({
      fileName: record.fileName,
      reasoning: record.analysis.reasoning || '',
      analysis: record.analysis
    });
    setContextMenu(null);
  };

  const executeReportIssue = () => {
    if (!contextMenu) return;
    const record = records.find(r => r.fileName === contextMenu.targetFileName);
    if (!record?.analysis) {
      alert(lang === 'ja' ? '解析結果がありません' : 'No analysis result');
      setContextMenu(null);
      return;
    }

    const changeLog = record.analysis.changeLog || [];
    let defaultType: IssueType = 'wrong_classification';
    if (changeLog.some(c => c.stage === 'context_relay')) defaultType = 'wrong_inheritance';
    else if (changeLog.some(c => c.stage === 'master_validation')) defaultType = 'master_rejection';
    else if (changeLog.some(c => c.stage === 'temperature_validation')) defaultType = 'temperature_error';

    setIssueType(defaultType);
    setIssueDescription('');
    setIssueModal({ record });
    setContextMenu(null);
  };

  const handleSaveIssue = async () => {
    if (!issueModal || !issueDescription.trim()) return;
    setIsSavingIssue(true);
    try {
      await saveAnalysisIssue(issueModal.record, issueDescription, issueType);
      alert(txt.issueSaved);
      setIssueModal(null);
      setIssueDescription('');
    } catch (e) {
      console.error('Failed to save issue:', e);
      alert(lang === 'ja' ? '保存に失敗しました' : 'Failed to save');
    } finally {
      setIsSavingIssue(false);
    }
  };

  return {
    contextMenu,
    handleContextMenu,
    closeContextMenu,
    executeDelete,
    executeReanalyze,
    executeSaveAsExample,
    executeShowReasoning,
    executeReportIssue,
    isSavingExample,
    reasoningModal,
    setReasoningModal,
    issueModal,
    setIssueModal,
    issueDescription,
    setIssueDescription,
    issueType,
    setIssueType,
    isSavingIssue,
    handleSaveIssue,
  };
}
