import { describe, expect, it } from 'vitest';
import { analyzedSummaryLines } from '../src/modules/analyze/log-summary';
import type { FileAnalysis, FileEntry } from '../src/types';

/** Minimal mock file entry for testing. */
const mockFileEntry: FileEntry = {
  path: 'test.ts',
  blobSha: 'abc123def456',
  shortBlobSha: 'abc123d',
  lastCommitSha: 'def456abc789',
  shortCommitSha: 'def456a',
};

/** Helper to create a minimal FileAnalysis for testing. */
function createFileAnalysis(overrides: Partial<FileAnalysis> & { filePath: string }): FileAnalysis {
  return {
    filePath: overrides.filePath,
    overrideStatus: overrides.overrideStatus,
    upstreamFile: overrides.upstreamFile ?? mockFileEntry,
    forkFile: overrides.forkFile,
    blobStatus: overrides.blobStatus ?? 'identical',
    commitSummary: overrides.commitSummary,
    mergeStrategy: overrides.mergeStrategy,
  };
}

describe('analyzedSummaryLines', () => {
  it('should generate summary without runtime errors for empty input', () => {
    const lines = analyzedSummaryLines([]);
    expect(lines).toBeDefined();
    expect(lines.length).toBeGreaterThan(0);
  });

  it('should count identical files correctly', () => {
    const files: FileAnalysis[] = [
      createFileAnalysis({
        filePath: 'test.ts',
        commitSummary: {
          status: 'upToDate',
          commitsAhead: 0,
          commitsBehind: 0,
          historyCoverage: 'complete',
        },
      }),
    ];
    const lines = analyzedSummaryLines(files);
    // Should contain "1" for identical count (stripped of ANSI)
    const plainLines = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
    const identicalLine = plainLines.find((l) => l.includes('identical'));
    expect(identicalLine).toContain('1');
  });

  it('should count drifted files (ahead + unpinned)', () => {
    const files: FileAnalysis[] = [
      createFileAnalysis({
        filePath: 'unpinned.ts',
        overrideStatus: undefined,
        commitSummary: {
          status: 'ahead',
          commitsAhead: 2,
          commitsBehind: 0,
          historyCoverage: 'complete',
        },
      }),
    ];
    const lines = analyzedSummaryLines(files);
    const plainLines = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
    const driftedLine = plainLines.find((l) => l.includes('drifted'));
    expect(driftedLine).toContain('1');
  });

  it('should count ahead files (ahead + pinned)', () => {
    const files: FileAnalysis[] = [
      createFileAnalysis({
        filePath: 'pinned.ts',
        overrideStatus: 'pinned',
        commitSummary: {
          status: 'ahead',
          commitsAhead: 1,
          commitsBehind: 0,
          historyCoverage: 'complete',
        },
      }),
    ];
    const lines = analyzedSummaryLines(files);
    const plainLines = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
    const aheadLine = plainLines.find((l) => l.includes('ahead') && !l.includes('drifted'));
    expect(aheadLine).toContain('1');
  });

  it('should count locked files (diverged + pinned)', () => {
    const files: FileAnalysis[] = [
      createFileAnalysis({
        filePath: 'locked.ts',
        overrideStatus: 'pinned',
        commitSummary: {
          status: 'diverged',
          commitsAhead: 1,
          commitsBehind: 1,
          historyCoverage: 'complete',
        },
      }),
    ];
    const lines = analyzedSummaryLines(files);
    const plainLines = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
    const lockedLine = plainLines.find((l) => l.includes('locked'));
    expect(lockedLine).toContain('1');
  });

  it('should count conflict files (diverged + unpinned)', () => {
    const files: FileAnalysis[] = [
      createFileAnalysis({
        filePath: 'conflict.ts',
        overrideStatus: undefined,
        commitSummary: {
          status: 'diverged',
          commitsAhead: 1,
          commitsBehind: 1,
          historyCoverage: 'complete',
        },
      }),
    ];
    const lines = analyzedSummaryLines(files);
    const plainLines = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
    const conflictLine = plainLines.find((l) => l.includes('conflict'));
    expect(conflictLine).toContain('1');
  });

  it('should count behind files correctly', () => {
    const files: FileAnalysis[] = [
      createFileAnalysis({
        filePath: 'behind.ts',
        commitSummary: {
          status: 'behind',
          commitsAhead: 0,
          commitsBehind: 3,
          historyCoverage: 'complete',
        },
      }),
    ];
    const lines = analyzedSummaryLines(files);
    const plainLines = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
    const behindLine = plainLines.find((l) => l.includes('behind'));
    expect(behindLine).toContain('1');
  });
});
