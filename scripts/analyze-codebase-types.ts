/**
 * コードベース分析の型定義
 */

export interface FileStats {
  path: string;
  lines: number;
  size: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  file?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'in_progress' | 'done';
  assignee?: string;
  estimatedLines?: number;
}

export interface HealthCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  count: number;
  details: string[];
}

export interface ModuleNode {
  path: string;
  category: 'components' | 'services' | 'hooks' | 'utils' | 'other';
  imports: string[];
  importedBy: string[];
  complexity: number;
}

export interface ComponentAnalysis {
  path: string;
  propsCount: number;
  hooksUsed: string[];
  stateCount: number;
  effectCount: number;
  jsxDepth: number;
  issues: string[];
  suggestions: string[];
}

export interface ImprovementSuggestion {
  id: string;
  category: 'architecture' | 'performance' | 'maintainability' | 'ui';
  title: string;
  description: string;
  files: string[];
  priority: 'high' | 'medium' | 'low';
  effort: 'small' | 'medium' | 'large';
  prompt: string;
}

export interface FeatureFlowNode {
  id: string;
  name: string;
  type: 'screen' | 'modal' | 'panel' | 'action';
  component: string;
  description: string;
  children: FeatureFlowNode[];
  backendModules: string[];
}

export interface BackendModuleGroup {
  category: string;
  description: string;
  modules: {
    path: string;
    name: string;
    exports: string[];
    usedBy: string[];
  }[];
}

export interface SimilarModulePair {
  modules: [string, string];
  similarity: number;
  reason: string;
  comparisonPrompt: string;
}

export interface CodebaseStats {
  generatedAt: string;
  totalFiles: number;
  totalLines: number;
  largeFiles: FileStats[];
  components: { count: number; files: string[] };
  services: { count: number; files: string[] };
  hooks: { count: number; files: string[] };
  utils: { count: number; files: string[] };
  tasks: Task[];
  health: HealthCheck[];
  moduleDependencies: ModuleNode[];
  componentAnalysis: ComponentAnalysis[];
  suggestions: ImprovementSuggestion[];
  architectureIssues: string[];
  featureFlow: FeatureFlowNode;
  backendGroups: BackendModuleGroup[];
  similarModules: SimilarModulePair[];
}
