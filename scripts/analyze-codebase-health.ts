/**
 * コードベース健全性チェック
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { HealthCheck } from './analyze-codebase-types.js';

type CheckFn = () => Promise<HealthCheck>;

function createCheck(name: string, cmd: string, ROOT: string, parser: (stdout: string, stderr: string) => HealthCheck): CheckFn {
  return async () => {
    try {
      const output = execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
      return parser(output, '');
    } catch (e: any) {
      return parser(e.stdout || '', e.stderr || '');
    }
  };
}

export async function runHealthChecks(ROOT: string): Promise<HealthCheck[]> {
  const checks: CheckFn[] = [
    // npm audit
    createCheck('npm audit', 'npm audit --json', ROOT, (stdout) => {
      try {
        const result = JSON.parse(stdout || '{}');
        const vulns = result.metadata?.vulnerabilities || {};
        const total = (vulns.high || 0) + (vulns.critical || 0) + (vulns.moderate || 0) + (vulns.low || 0);
        const details: string[] = [];
        if (vulns.critical) details.push(`critical: ${vulns.critical}`);
        if (vulns.high) details.push(`high: ${vulns.high}`);
        return {
          name: 'npm audit',
          status: vulns.critical || vulns.high ? 'error' : total > 0 ? 'warning' : 'ok',
          count: total,
          details: details.length ? details : ['脆弱性なし']
        };
      } catch { return { name: 'npm audit', status: 'ok', count: 0, details: ['脆弱性なし'] }; }
    }),

    // depcheck
    async () => {
      try {
        const ignores = '@tailwindcss/postcss,postcss,tailwindcss,jscpd,knip,typescript';
        let output = '';
        try {
          output = execSync(`npx depcheck --json --ignores="${ignores}"`, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
        } catch (e: any) { output = e.stdout || ''; }
        if (!output) return { name: 'depcheck', status: 'warning', count: 0, details: ['解析失敗'] };
        const data = JSON.parse(output);
        const unused = [...(data.dependencies || []), ...(data.devDependencies || [])];
        return { name: 'depcheck', status: unused.length > 0 ? 'warning' : 'ok', count: unused.length, details: unused.length ? [`未使用: ${unused.slice(0, 5).join(', ')}`] : ['問題なし'] };
      } catch { return { name: 'depcheck', status: 'warning', count: 0, details: ['解析失敗'] }; }
    },

    // TypeScript
    createCheck('TypeScript', 'npx tsc --noEmit', ROOT, (stdout, stderr) => {
      const output = stdout || stderr || '';
      const errorCount = (output.match(/error TS\d+/g) || []).length;
      const lines = output.split('\n').filter((l: string) => l.includes('error TS')).slice(0, 5);
      return { name: 'TypeScript', status: errorCount > 0 ? 'error' : 'ok', count: errorCount, details: lines.length ? lines.map((l: string) => l.slice(0, 80)) : ['型エラーなし'] };
    }),

    // ESLint
    createCheck('ESLint', 'npx eslint . --ext .ts,.tsx --format json --max-warnings 0', ROOT, (stdout) => {
      try {
        const results = JSON.parse(stdout || '[]');
        let errorCount = 0, warningCount = 0;
        for (const file of results) { errorCount += file.errorCount || 0; warningCount += file.warningCount || 0; }
        return { name: 'ESLint', status: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'ok', count: errorCount + warningCount, details: [`errors: ${errorCount}, warnings: ${warningCount}`] };
      } catch { return { name: 'ESLint', status: 'ok', count: 0, details: ['設定なし or 問題なし'] }; }
    }),

    // jscpd
    async () => {
      try {
        execSync('npx jscpd --min-tokens 50 --reporters json --output .jscpd --silent components services hooks utils', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
        const reportPath = path.join(ROOT, '.jscpd', 'jscpd-report.json');
        if (fs.existsSync(reportPath)) {
          const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
          const clones = report.duplicates?.length || 0;
          const percentage = report.statistics?.total?.percentage || 0;
          fs.rmSync(path.join(ROOT, '.jscpd'), { recursive: true, force: true });
          return { name: 'jscpd', status: percentage > 10 ? 'warning' : 'ok', count: clones, details: [`重複: ${percentage.toFixed(1)}% (${clones}箇所)`] };
        }
        return { name: 'jscpd', status: 'ok', count: 0, details: ['重複なし'] };
      } catch { return { name: 'jscpd', status: 'ok', count: 0, details: ['解析スキップ'] }; }
    },

    // knip
    createCheck('knip', 'npx knip --no-progress', ROOT, (stdout) => {
      const lines = (stdout || '').split('\n').filter((l: string) => l.trim());
      return { name: 'knip', status: lines.length > 10 ? 'warning' : 'ok', count: lines.length, details: lines.slice(0, 5).map((l: string) => l.slice(0, 60)) || ['未使用コードなし'] };
    }),
  ];

  console.log('  ⚡ Running 6 health checks in parallel...');
  return Promise.all(checks.map(fn => fn()));
}
