#!/usr/bin/env npx tsx
/**
 * Rust プロジェクトへの同期スクリプト
 *
 * layout-config.json と生成ファイルを photo-ai-rust プロジェクトにコピー
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GAS_ROOT = path.join(__dirname, '..');
const RUST_ROOT = path.join(GAS_ROOT, 'photo-ai-rust');

// コピー対象ファイル
const FILES_TO_COPY = [
  {
    src: 'shared/layout-config/layout-config.json',
    dest: 'shared/layout-config/layout-config.json',
    description: 'Layout config JSON (SSoT)'
  },
  {
    src: 'shared/layout-config/layout-config.schema.json',
    dest: 'shared/layout-config/layout-config.schema.json',
    description: 'Layout config schema'
  }
];

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  Created directory: ${dir}`);
  }
}

function copyFile(srcRelPath: string, destRelPath: string, description: string) {
  const srcPath = path.join(GAS_ROOT, srcRelPath);
  const destPath = path.join(RUST_ROOT, destRelPath);

  if (!fs.existsSync(srcPath)) {
    console.error(`  ❌ Source not found: ${srcPath}`);
    return false;
  }

  ensureDir(path.dirname(destPath));

  const srcContent = fs.readFileSync(srcPath);
  const destExists = fs.existsSync(destPath);
  const destContent = destExists ? fs.readFileSync(destPath) : null;

  if (destContent && srcContent.equals(destContent)) {
    console.log(`  ⏩ Unchanged: ${destRelPath}`);
    return true;
  }

  fs.copyFileSync(srcPath, destPath);
  console.log(`  ✅ ${destExists ? 'Updated' : 'Created'}: ${destRelPath} (${description})`);
  return true;
}

function main() {
  console.log('Syncing layout config to photo-ai-rust...\n');
  console.log(`GAS root: ${GAS_ROOT}`);
  console.log(`Rust root: ${RUST_ROOT}\n`);

  // Rust プロジェクトの存在確認
  if (!fs.existsSync(RUST_ROOT)) {
    console.error('❌ Rust project not found at:', RUST_ROOT);
    process.exit(1);
  }

  let success = true;

  // ファイルをコピー
  console.log('Copying files:');
  for (const file of FILES_TO_COPY) {
    if (!copyFile(file.src, file.dest, file.description)) {
      success = false;
    }
  }

  // 生成ファイルの確認（これらはgenerate:rsとgenerate:jsで生成済みの想定）
  console.log('\nChecking generated files:');

  const generatedFiles = [
    { path: 'common/src/layout_generated.rs', name: 'Rust layout' },
    { path: 'web-wasm/js/layout-constants.generated.js', name: 'JS constants' }
  ];

  for (const file of generatedFiles) {
    const fullPath = path.join(RUST_ROOT, file.path);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      const mtime = stat.mtime.toISOString();
      console.log(`  ✅ ${file.name}: ${file.path} (modified: ${mtime})`);
    } else {
      console.log(`  ⚠️  ${file.name} not found: ${file.path}`);
      console.log(`     Run 'npm run generate:rs' or 'npm run generate:js' first`);
    }
  }

  console.log('\n' + (success ? '✅ Sync complete!' : '⚠️  Sync completed with warnings'));

  // 次のステップを表示
  console.log('\nNext steps:');
  console.log('  1. cd photo-ai-rust');
  console.log('  2. cargo build');
  console.log('  3. cargo test');
}

main();
