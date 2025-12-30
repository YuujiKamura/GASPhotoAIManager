import React, { useState, useEffect, useCallback, useRef, RefObject } from 'react';

interface UseUploadViewStateResult {
  fileInputRef: RefObject<HTMLInputElement>;
  fileInputImportRef: RefObject<HTMLInputElement>;
  isDragging: boolean;
  pendingFiles: File[] | null;
  setPendingFiles: (files: File[] | null) => void;
  showMenu: boolean;
  setShowMenu: (v: boolean) => void;
  showConsole: boolean;
  setShowConsole: (v: boolean) => void;
  handleDragOver: (e: React.DragEvent, isProcessing: boolean, apiKey: string) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, isProcessing: boolean, apiKey: string) => void;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleClick: (isProcessing: boolean, apiKey: string, onOpenSettings?: () => void) => void;
}

export function useUploadViewState(): UseUploadViewStateResult {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputImportRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showConsole, setShowConsole] = useState(false);

  useEffect(() => {
    if (showMenu) {
      const handleClickOutside = () => setShowMenu(false);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMenu]);

  const handleDragOver = useCallback((e: React.DragEvent, isProcessing: boolean, apiKey: string) => {
    e.preventDefault();
    if (!isProcessing && apiKey) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, isProcessing: boolean, apiKey: string) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isProcessing && apiKey && e.dataTransfer.files?.length) {
      setPendingFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) setPendingFiles(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleClick = useCallback((isProcessing: boolean, apiKey: string, onOpenSettings?: () => void) => {
    if (!isProcessing && apiKey) fileInputRef.current?.click();
    else if (!apiKey) onOpenSettings?.();
  }, []);

  return {
    fileInputRef,
    fileInputImportRef,
    isDragging,
    pendingFiles,
    setPendingFiles,
    showMenu,
    setShowMenu,
    showConsole,
    setShowConsole,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
    handleClick,
  };
}
