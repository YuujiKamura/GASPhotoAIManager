import { useState, useEffect, useCallback } from 'react';
import codebaseStats from '../src/generated/codebase-stats.json';

interface DashboardState {
  expandedSections: Set<string>;
  isLoading: boolean;
  showMenu: boolean;
  healthChecks: any[];
}

interface DashboardActions {
  toggle: (section: string) => void;
  setShowMenu: (value: boolean) => void;
  runAnalysis: () => Promise<void>;
}

export function useDashboardState(): DashboardState & DashboardActions {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['tasks']));
  const [isLoading, setIsLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [healthChecks, setHealthChecks] = useState<any[]>([]);

  useEffect(() => {
    setHealthChecks((codebaseStats as any).health || []);
    setIsLoading(false);
  }, []);

  const toggle = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  }, []);

  const runAnalysis = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/analyze');
      if ((await res.json()).success) {
        window.location.reload();
      } else {
        setIsLoading(false);
      }
    } catch {
      setIsLoading(false);
    }
  }, []);

  return {
    expandedSections,
    isLoading,
    showMenu,
    healthChecks,
    toggle,
    setShowMenu,
    runAnalysis,
  };
}

// CopyButton用のフック
export function useCopyState() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return { copied, handleCopy };
}

// SuggestionCard用のフック
export function useExpandedState(initial = false) {
  const [expanded, setExpanded] = useState(initial);
  const toggle = useCallback(() => setExpanded(prev => !prev), []);
  return { expanded, toggle };
}
