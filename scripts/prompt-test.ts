/**
 * Prompt Test CLI
 * 複数プロンプトを並列実行して比較
 *
 * Usage:
 *   npx tsx scripts/prompt-test.ts --prompts v1_baseline,v2_detailed --images ./test-images/
 */

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';

const program = new Command();

program
  .name('prompt-test')
  .description('Compare multiple prompts against test images')
  .option('-p, --prompts <versions>', 'Comma-separated prompt versions', 'v1_baseline')
  .option('-i, --images <dir>', 'Test images directory', './test-images')
  .option('-o, --output <dir>', 'Output directory', './prompt-results')
  .option('-m, --mode <mode>', 'App mode (construction/general)', 'construction')
  .option('--dry-run', 'Show what would be done without executing')
  .parse();

async function main() {
  const opts = program.opts();
  // 実装...
}

main().catch(console.error);
