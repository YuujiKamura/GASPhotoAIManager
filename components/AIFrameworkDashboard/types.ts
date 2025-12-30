import React from 'react';
import { PromptLayerType } from '../../hooks/useAIFrameworkState';

export interface PromptLayer {
  id: PromptLayerType;
  name: string;
  icon: React.ReactNode;
  description: string;
}

export interface FlowStep {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  optional?: boolean;
}

export interface TabItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}
