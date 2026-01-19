/**
 * Tests for log file output functionality (--log flag).
 */
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#/config', () => ({
  config: { logFile: false, workingDirectory: process.cwd(), isVerbose: false },
}));

import { config } from '#/config';
import { analyzedFileLine, finalizeLogFile, initLogFile, logAnalyzedFileLine } from '#/modules/analyze/log-file';
import type { FileAnalysis } from '#/types';

/** Create a minimal mock FileAnalysis */
function createMockFile(filePath: string, status: 'behind' | 'ahead' | 'diverged' = 'behind'): FileAnalysis {
  const entry = { path: filePath, blobSha: 'abc123', shortBlobSha: 'abc', lastCommitSha: 'def456', shortCommitSha: 'def' };
  return {
    filePath,
    upstreamFile: entry,
    forkFile: entry,
    blobStatus: 'different',
    commitSummary: { status, commitsAhead: status === 'behind' ? 0 : 1, commitsBehind: status === 'ahead' ? 0 : 1, historyCoverage: 'complete' },
    mergeStrategy: { strategy: status === 'diverged' ? 'manual' : 'keep-upstream', reason: 'test' },
  };
}

function findLogFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.startsWith('cella-sync.') && f.endsWith('.log'));
}

describe('log file output', () => {
  const testDir = process.cwd();

  beforeEach(() => {
    vi.mocked(config).logFile = false;
    vi.mocked(config).workingDirectory = testDir;
  });

  afterEach(() => {
    for (const file of findLogFiles(testDir)) unlinkSync(join(testDir, file));
  });

  it('should create log file with filenames when --log is set', () => {
    vi.mocked(config).logFile = true;
    initLogFile();

    for (const path of ['src/index.ts', 'package.json', 'README.md']) {
      const file = createMockFile(path);
      logAnalyzedFileLine(file, analyzedFileLine(file));
    }
    finalizeLogFile();

    const logFiles = findLogFiles(testDir);
    expect(logFiles.length).toBe(1);

    const content = readFileSync(join(testDir, logFiles[0]), 'utf-8');
    expect(content).toContain('src/index.ts');
    expect(content).toContain('package.json');
    expect(content).toContain('README.md');
    expect(content).toContain('Cella Sync Analysis Log');
    expect(content).not.toMatch(/\x1b\[[0-9;]*m/); // No ANSI codes
  });

  it('should not create log file when --log is not set', () => {
    vi.mocked(config).logFile = false;
    initLogFile();
    expect(findLogFiles(testDir).length).toBe(0);
  });
});
