import { useState } from 'react';

/**
 * モーダル表示状態を一元管理するカスタムフック
 * App.tsx の肥大化を防ぐため、モーダル関連の状態をここに集約
 */
export function useAppModals() {
  const [showApiKeySetup, setShowApiKeySetup] = useState(false);
  const [showModelValidation, setShowModelValidation] = useState(false);
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [showManualPairing, setShowManualPairing] = useState(false);
  const [showMasterEditor, setShowMasterEditor] = useState(false);
  const [showStationReplace, setShowStationReplace] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showGitHubSync, setShowGitHubSync] = useState(false);
  const [showWorkTypeConfirm, setShowWorkTypeConfirm] = useState(false);
  const [showHealthDashboard, setShowHealthDashboard] = useState(false);
  const [showNormalizationModal, setShowNormalizationModal] = useState(false);
  const [showPdfLoadDialog, setShowPdfLoadDialog] = useState(false);
  const [showAIFramework, setShowAIFramework] = useState(false);

  // 一括でモーダルを閉じる
  const closeAllModals = () => {
    setShowApiKeySetup(false);
    setShowModelValidation(false);
    setShowRefineModal(false);
    setShowManualPairing(false);
    setShowMasterEditor(false);
    setShowStationReplace(false);
    setShowHistory(false);
    setShowGitHubSync(false);
    setShowWorkTypeConfirm(false);
    setShowHealthDashboard(false);
    setShowNormalizationModal(false);
    setShowPdfLoadDialog(false);
    setShowAIFramework(false);
  };

  return {
    // API Key Setup
    showApiKeySetup,
    setShowApiKeySetup,

    // Model Validation
    showModelValidation,
    setShowModelValidation,

    // Refine Modal
    showRefineModal,
    setShowRefineModal,

    // Manual Pairing
    showManualPairing,
    setShowManualPairing,

    // Master Editor
    showMasterEditor,
    setShowMasterEditor,

    // Station Replace
    showStationReplace,
    setShowStationReplace,

    // History
    showHistory,
    setShowHistory,

    // GitHub Sync
    showGitHubSync,
    setShowGitHubSync,

    // Work Type Confirm
    showWorkTypeConfirm,
    setShowWorkTypeConfirm,

    // Health Dashboard
    showHealthDashboard,
    setShowHealthDashboard,

    // Normalization Modal
    showNormalizationModal,
    setShowNormalizationModal,

    // PDF Load Dialog
    showPdfLoadDialog,
    setShowPdfLoadDialog,

    // AI Framework Dashboard
    showAIFramework,
    setShowAIFramework,

    // Utility
    closeAllModals,
  };
}
