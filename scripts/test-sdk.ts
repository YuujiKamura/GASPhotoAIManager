/**
 * Claude Code SDK テストスクリプト
 *
 * SDKでセッション維持・画像解析ができることを確認
 *
 * 実行: npx ts-node scripts/test-sdk.ts
 * または: npx esbuild scripts/test-sdk.ts --bundle --platform=node --target=node18 --outfile=dist-cli/test-sdk.js --format=esm --packages=external && node dist-cli/test-sdk.js
 */

import { query } from '@anthropic-ai/claude-code-sdk';
import * as path from 'path';
import { existsSync } from 'fs';

interface SDKMessage {
  type: string;
  session_id?: string;
  content?: unknown;
  [key: string]: unknown;
}

async function testBasicQuery() {
  console.log('\n=== Test 1: Basic Query ===');

  const result = query({
    prompt: 'Say "Hello from SDK!" and nothing else.',
    options: {
      cwd: process.cwd(),
      permissionMode: 'bypassPermissions',
    },
  });

  let sessionId: string | undefined;

  for await (const msg of result as AsyncIterable<SDKMessage>) {
    console.log('Message type:', msg.type);

    if (msg.session_id && !sessionId) {
      sessionId = msg.session_id;
      console.log('Session ID captured:', sessionId);
    }

    if (msg.type === 'assistant' && msg.content) {
      console.log('Response:', JSON.stringify(msg.content).substring(0, 200));
    }

    if (msg.type === 'result') {
      console.log('Query completed');
    }
  }

  console.log('Final Session ID:', sessionId);
  return sessionId;
}

async function testSessionResume(sessionId: string) {
  console.log('\n=== Test 2: Session Resume ===');
  console.log('Resuming session:', sessionId);

  const result = query({
    prompt: 'What did I just ask you? Repeat it.',
    options: {
      cwd: process.cwd(),
      permissionMode: 'bypassPermissions',
      resume: sessionId,
    },
  });

  for await (const msg of result as AsyncIterable<SDKMessage>) {
    console.log('Message type:', msg.type);

    if (msg.type === 'assistant' && msg.content) {
      console.log('Response:', JSON.stringify(msg.content).substring(0, 300));
    }

    if (msg.type === 'result') {
      console.log('Resume test completed');
    }
  }
}

async function testImageAnalysis() {
  console.log('\n=== Test 3: Image Analysis ===');

  // テスト画像を探す
  const testImagesDir = path.join(process.cwd(), 'test-images');
  const tempImagesDir = path.join(process.cwd(), 'temp-images');

  let testImagePath: string | null = null;

  // いくつかの場所を探す
  const searchDirs = [testImagesDir, tempImagesDir, process.cwd()];
  for (const dir of searchDirs) {
    if (existsSync(dir)) {
      const { readdirSync } = await import('fs');
      try {
        const files = readdirSync(dir).filter((f) =>
          /\.(jpg|jpeg|png|gif)$/i.test(f)
        );
        if (files.length > 0) {
          testImagePath = path.join(dir, files[0]);
          break;
        }
      } catch {
        continue;
      }
    }
  }

  if (!testImagePath) {
    console.log('No test image found. Skipping image analysis test.');
    console.log('Create a test image in test-images/ directory to test image analysis.');
    return;
  }

  console.log('Test image:', testImagePath);

  // 画像パスをプロンプトに含める方式
  const prompt = `Read the following image file and describe what you see in 2-3 sentences: ${testImagePath}`;

  const result = query({
    prompt,
    options: {
      cwd: process.cwd(),
      permissionMode: 'bypassPermissions',
    },
  });

  for await (const msg of result as AsyncIterable<SDKMessage>) {
    console.log('Message type:', msg.type);

    if (msg.type === 'assistant' && msg.content) {
      console.log('Image analysis result:', JSON.stringify(msg.content).substring(0, 500));
    }

    if (msg.type === 'result') {
      console.log('Image analysis completed');
    }
  }
}

async function main() {
  console.log('=== Claude Code SDK Test ===');
  console.log('Working directory:', process.cwd());

  try {
    // Test 1: Basic query
    const sessionId = await testBasicQuery();

    // Test 2: Session resume (if session ID captured)
    if (sessionId) {
      await testSessionResume(sessionId);
    } else {
      console.log('\nSkipping session resume test: no session ID captured');
    }

    // Test 3: Image analysis
    await testImageAnalysis();

    console.log('\n=== All tests completed ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

main();
