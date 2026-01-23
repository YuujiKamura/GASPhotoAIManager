/**
 * StepProgress - 汎用ステップ進捗表示コンポーネント
 *
 * バッチ解析・対話型解析の両方で使用可能な汎用的なステップ進捗表示。
 *
 * @example
 * // 基本的な使い方
 * import { StepProgressCore, useStepProgress } from '../components/StepProgress';
 *
 * const STEPS = [
 *   { id: 'step1', name: 'ステップ1' },
 *   { id: 'step2', name: 'ステップ2' },
 * ] as const;
 *
 * function MyComponent() {
 *   const { steps, startStep, completeStep } = useStepProgress(STEPS);
 *
 *   return (
 *     <StepProgressCore
 *       steps={steps}
 *       title="処理の進捗"
 *     />
 *   );
 * }
 */

export { StepProgressCore } from './StepProgressCore';
export { useStepProgress } from '../../hooks/useStepProgress';
export type {
  Step,
  StepConfig,
  StepStatus,
  UseStepProgressReturn,
} from '../../hooks/useStepProgress';
