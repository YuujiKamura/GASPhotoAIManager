import React, { useState, useRef, useEffect, useCallback } from 'react';

export function useUploadViewState(isProcessing: boolean) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputImportRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showConsole, setShowConsole] = useState(false);

  // Close menu on outside click
  useEffect(() => {
    if (showMenu) {
      const handleClickOutside = () => setShowMenu(false);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMenu]);

  // Drag handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing) setIsDragging(true);
  }, [isProcessing]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isProcessing && e.dataTransfer.files?.length) {
      setPendingFiles(Array.from(e.dataTransfer.files));
    }
  }, [isProcessing]);

  // File input handlers
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      setPendingFiles(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleClick = useCallback(() => {
    if (!isProcessing) fileInputRef.current?.click();
  }, [isProcessing]);

  const triggerImportClick = useCallback(() => {
    fileInputImportRef.current?.click();
  }, []);

  // Menu toggle
  const toggleMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(prev => !prev);
  }, []);

  const closeMenu = useCallback(() => setShowMenu(false), []);

  // Console toggle
  const toggleConsole = useCallback(() => setShowConsole(prev => !prev), []);

  // Clear pending files
  const clearPendingFiles = useCallback(() => setPendingFiles(null), []);

  return {
    refs: { fileInputRef, fileInputImportRef },
    state: { isDragging, pendingFiles, showMenu, showConsole },
    handlers: {
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleFileInputChange,
      handleClick,
      triggerImportClick,
      toggleMenu,
      closeMenu,
      toggleConsole,
      clearPendingFiles,
    },
  };
}
