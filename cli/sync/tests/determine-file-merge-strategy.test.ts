import { describe, expect, it } from 'vitest';
import { determineFileMergeStrategy } from '../src/modules/git/determine-file-merge-strategy';
import type { CommitSummary, FileAnalysis, FileEntry } from '../src/types';

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
    it('should skip-upstream for ignored files (existing)', () => {
      const analysis = createFileAnalysis({ overrideStatus: 'ignored' });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('skip-upstream');
      expect(result.reason).toContain('ignored');
    });

    it('should skip-upstream for ignored files (new file)', () => {
      const analysis = createFileAnalysis({
        overrideStatus: 'ignored',
        forkFile: undefined,
        blobStatus: 'missing',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('skip-upstream');
      expect(result.reason).toContain('ignored');
    });

    it('should skip-upstream regardless of blob status for ignored files', () => {
      const analysis = createFileAnalysis({
        overrideStatus: 'ignored',
        blobStatus: 'identical',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('skip-upstream');
    });
  });

  describe('identical blobs', () => {
    it('should keep-fork when blobs are identical', () => {
      const analysis = createFileAnalysis({ blobStatus: 'identical' });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-fork');
      expect(result.reason).toContain('Content identical');
    });

    it('should keep-fork when blobs identical even if pinned', () => {
      const analysis = createFileAnalysis({
        blobStatus: 'identical',
        overrideStatus: 'pinned',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-fork');
      expect(result.reason).toContain('Content identical');
    });
  });

  describe('new files (missing in fork)', () => {
    it('should keep-upstream for new files', () => {
      const analysis = createFileAnalysis({
        forkFile: undefined,
        blobStatus: 'missing',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-upstream');
      expect(result.reason).toContain('New file');
    });

    it('should keep-upstream for new files even if pinned (pinned only protects existing)', () => {
      const analysis = createFileAnalysis({
        forkFile: undefined,
        blobStatus: 'missing',
        overrideStatus: 'pinned',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-upstream');
      expect(result.reason).toContain('New file');
    });

    it('should skip-upstream for new files if ignored', () => {
      const analysis = createFileAnalysis({
        forkFile: undefined,
        blobStatus: 'missing',
        overrideStatus: 'ignored',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('skip-upstream');
    });
  });

  describe('pinned existing files', () => {
    it('should keep-fork for pinned files with different blobs', () => {
      const analysis = createFileAnalysis({
        overrideStatus: 'pinned',
        blobStatus: 'different',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-fork');
      expect(result.reason).toContain('pinned');
    });

    it('should keep-fork for pinned files regardless of commit status', () => {
      const statuses: CommitSummary['status'][] = ['ahead', 'behind', 'upToDate', 'diverged', 'unrelated'];

      for (const status of statuses) {
        const analysis = createFileAnalysis({
          overrideStatus: 'pinned',
          blobStatus: 'different',
          commitSummary: createCommitSummary(status),
        });
        const result = determineFileMergeStrategy(analysis);

        expect(result.strategy).toBe('keep-fork');
      }
    });
  });

  describe('non-pinned files with different blobs', () => {
    it('should keep-upstream for different blobs (sync to upstream)', () => {
      const analysis = createFileAnalysis({
        blobStatus: 'different',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-upstream');
      expect(result.reason).toContain('Will sync from upstream');
    });

    it('should keep-upstream regardless of commit status', () => {
      const statuses: CommitSummary['status'][] = ['ahead', 'behind', 'upToDate', 'diverged', 'unrelated'];

      for (const status of statuses) {
        const analysis = createFileAnalysis({
          blobStatus: 'different',
          commitSummary: createCommitSummary(status),
        });
        const result = determineFileMergeStrategy(analysis);

        expect(result.strategy).toBe('keep-upstream');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle missing commitSummary gracefully', () => {
      const analysis = createFileAnalysis({
        commitSummary: undefined,
        blobStatus: 'different',
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('keep-upstream');
    });

    it('should prioritize ignored check (runs before blob checks)', () => {
      const analysis = createFileAnalysis({
        overrideStatus: 'ignored',
        blobStatus: 'identical', // Would normally keep-fork
      });
      const result = determineFileMergeStrategy(analysis);

      expect(result.strategy).toBe('skip-upstream');
    });
  });
});
