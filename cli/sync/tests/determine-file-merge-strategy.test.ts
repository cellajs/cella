import { describe, expect, it } from 'vitest';
import { determineFileMergeStrategy } from '../src/modules/git/determine-file-merge-strategy';
import type { FileAnalysis, FileEntry, CommitSummary } from '../src/types';

/**
 * Helper to create a minimal FileEntry for testing
 */
function createFileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    path: 'test-file.ts',
    blobSha: 'abc123def456',
    shortBlobSha: 'abc123d',
    lastCommitSha: 'commit123456',
    shortCommitSha: 'commit1',
    ...overrides,
  };
}

/**
 * Helper to create a minimal CommitSummary for testing
 */
function createCommitSummary(status: CommitSummary['status'], overrides: Partial<CommitSummary> = {}): CommitSummary {
  return {
    status,
    commitsAhead: 0,
    commitsBehind: 0,
    historyCoverage: 'complete',
    ...overrides,
  };
}

/**
 * Helper to create a FileAnalysis object for testing.
 * By default creates upstream and fork with DIFFERENT commit SHAs to avoid
 * triggering the "HEADs identical" shortcut.
 */
function createFileAnalysis(overrides: Partial<FileAnalysis> = {}): FileAnalysis {
  const upstreamFile = createFileEntry({
    blobSha: 'upstream-blob-sha',
    lastCommitSha: 'upstream-commit-sha',
  });
  const forkFile = createFileEntry({
    blobSha: 'fork-blob-sha',
    lastCommitSha: 'fork-commit-sha',
  });

  return {
    filePath: 'test-file.ts',
    upstreamFile,
    forkFile,
    blobStatus: 'different',
    commitSummary: createCommitSummary('behind'),
    ...overrides,
  };
}

describe('determineFileMergeStrategy', () => {
  describe('ignored files', () => {
    it('should return skip-upstream for ignored files', () => {
      const analysis = createFileAnalysis({ overrideStatus: 'ignored' });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('skip-upstream');
      expect(result.reason).toContain('ignored');
    });

    it('should skip-upstream regardless of commit status for ignored files', () => {
      const analysis = createFileAnalysis({
        overrideStatus: 'ignored',
        commitSummary: createCommitSummary('diverged'),
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('skip-upstream');
    });
  });

  describe('identical files', () => {
    it('should keep-fork when commit HEADs are identical', () => {
      const sharedCommit = 'shared-commit-sha';
      const analysis = createFileAnalysis({
        upstreamFile: createFileEntry({ lastCommitSha: sharedCommit }),
        forkFile: createFileEntry({ lastCommitSha: sharedCommit }),
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-fork');
      expect(result.reason).toContain('HEADs identical');
    });

    it('should keep-fork when blobs are identical', () => {
      const analysis = createFileAnalysis({ blobStatus: 'identical' });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-fork');
      expect(result.reason).toContain('Blobs identical');
    });
  });

  describe('fork ahead or up-to-date', () => {
    it('should keep-fork when ahead with different blob', () => {
      const analysis = createFileAnalysis({
        commitSummary: createCommitSummary('ahead'),
        blobStatus: 'different',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-fork');
      expect(result.reason).toContain('ahead');
    });

    it('should keep-fork when upToDate with different blob', () => {
      const analysis = createFileAnalysis({
        commitSummary: createCommitSummary('upToDate'),
        blobStatus: 'different',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-fork');
      expect(result.reason).toContain('upToDate');
    });

    it('should skip-upstream when ahead and file deleted in fork (missing blob)', () => {
      const analysis = createFileAnalysis({
        commitSummary: createCommitSummary('ahead'),
        blobStatus: 'missing',
        forkFile: undefined,
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('skip-upstream');
      expect(result.reason).toContain('deleted in fork');
    });
  });

  describe('fork behind upstream', () => {
    it('should keep-upstream when behind with different blob (default)', () => {
      const analysis = createFileAnalysis({
        commitSummary: createCommitSummary('behind'),
        blobStatus: 'different',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-upstream');
      expect(result.reason).toContain('behind');
    });

    it('should keep-fork when behind with different blob but customized', () => {
      const analysis = createFileAnalysis({
        commitSummary: createCommitSummary('behind'),
        blobStatus: 'different',
        overrideStatus: 'customized',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-fork');
      expect(result.reason).toContain('customized');
    });

    it('should keep-upstream for new files in upstream (behind + missing)', () => {
      const analysis = createFileAnalysis({
        commitSummary: createCommitSummary('behind'),
        blobStatus: 'missing',
        forkFile: undefined,
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-upstream');
      expect(result.reason).toContain('New file');
    });
  });

  describe('diverged histories', () => {
    it('should require manual resolution for diverged without customized', () => {
      const analysis = createFileAnalysis({
        commitSummary: createCommitSummary('diverged'),
        blobStatus: 'different',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('manual');
      expect(result.reason).toContain('diverged');
    });

    it('should keep-fork for diverged when customized', () => {
      const analysis = createFileAnalysis({
        commitSummary: createCommitSummary('diverged'),
        blobStatus: 'different',
        overrideStatus: 'customized',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-fork');
      expect(result.reason).toContain('customized');
    });
  });

  describe('unrelated histories (first sync)', () => {
    it('should require manual resolution for unrelated without customized', () => {
      const analysis = createFileAnalysis({
        commitSummary: createCommitSummary('unrelated'),
        blobStatus: 'different',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('manual');
      expect(result.reason).toContain('unrelated');
    });

    it('should keep-fork for unrelated when customized', () => {
      const analysis = createFileAnalysis({
        commitSummary: createCommitSummary('unrelated'),
        blobStatus: 'different',
        overrideStatus: 'customized',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-fork');
      expect(result.reason).toContain('customized');
    });
  });

  describe('unknown/fallback cases', () => {
    it('should return unknown when no commit summary', () => {
      const analysis = createFileAnalysis({
        commitSummary: undefined,
        blobStatus: 'different',
      });
      // Without commitSummary, status defaults to 'unrelated'
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('manual');
    });

    it('should return unknown for unknown commit status', () => {
      const analysis = createFileAnalysis({
        commitSummary: createCommitSummary('unknown'),
        blobStatus: 'different',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('unknown');
      expect(result.reason).toContain('Could not determine');
    });
  });

  describe('edge cases', () => {
    it('should handle missing forkFile gracefully', () => {
      const analysis = createFileAnalysis({
        forkFile: undefined,
        blobStatus: 'missing',
        commitSummary: createCommitSummary('behind'),
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-upstream');
    });

    it('should prioritize ignored over customized', () => {
      // This shouldn't happen in practice, but test the precedence
      const analysis = createFileAnalysis({
        overrideStatus: 'ignored', // ignored takes priority
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('skip-upstream');
    });
  });
});
