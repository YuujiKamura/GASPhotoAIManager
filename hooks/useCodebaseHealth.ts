import { useState, useEffect, useCallback } from 'react';
import codebaseStats from '../src/generated/codebase-stats.json';

type Priority = 'high' | 'medium' | 'low';

export function useCodebaseHealth() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['tasks']));
  const [isLoading, setIsLoading] = useState(true);
  const [healthChecks, setHealthChecks] = useState<any[]>([]);

  const toggle = useCallback((s: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }, []);

  useEffect(() => {
    setHealthChecks((codebaseStats as any).health || []);
    setIsLoading(false);
  }, []);

  const runAnalysis = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/analyze');
      if ((await res.json()).success) window.location.reload();
      else setIsLoading(false);
    } catch {
      setIsLoading(false);
    }
  }, []);

  const tasks = (codebaseStats.tasks?.filter((t: any) => t.status === 'todo')
    .sort((a: any, b: any) =>
      ({ high: 0, medium: 1, low: 2 }[a.priority as Priority] ?? 2) -
      ({ high: 0, medium: 1, low: 2 }[b.priority as Priority] ?? 2)
    ) || []) as any[];

  const taskCounts = { high: 0, medium: 0, low: 0 };
  tasks.forEach((t: any) => {
    if (t.priority in taskCounts) {
      taskCounts[t.priority as keyof typeof taskCounts]++;
    }
  });

  return {
    expandedSections,
    isLoading,
    healthChecks,
    tasks,
    taskCounts,
    toggle,
    runAnalysis,
    stats: codebaseStats as any,
  };
}
