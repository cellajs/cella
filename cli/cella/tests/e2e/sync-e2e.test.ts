/**
 * E2E tests for sync CLI services.
 *
 * These tests create real git repos and run the actual sync services
 * to verify end-to-end behavior.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAnalyze } from '../../src/services/analyze';
import { runSync } from '../../src/services/sync';
import {
  buildRuntimeConfig,
  createTestEnv,
  deleteFileAndCommit,
  fetchUpstream,
  fileExists,
  makeCommit,
  readRepoFile,
  renameFileAndCommit,
  resetFork,
  type TestEnv,
} from './helpers/test-env';

describe('sync e2e', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    resetFork(env.forkPath);
    env.cleanup();
  });

  describe('analyze service', () => {
    it('should detect fork is identical to upstream', async () => {
      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, { service: 'analyze' });

      const result = await runAnalyze(config);

      expect(result.success).toBe(true);
      expect(result.summary.identical).toBeGreaterThan(0);
      expect(result.summary.behind).toBe(0);
      expect(result.summary.diverged).toBe(0);
    });

    it('should detect fork is behind when upstream has new commits', async () => {
      // Add new file to upstream
      makeCommit(env.upstreamPath, {
        files: { 'new-feature.ts': '// New feature\nexport const feature = true;\n' },
        message: 'feat: add new feature',
      });

      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, { service: 'analyze' });

      const result = await runAnalyze(config);

      expect(result.success).toBe(true);
      expect(result.summary.behind).toBeGreaterThan(0);

      const behindFile = result.files.find((f) => f.path === 'new-feature.ts');
      expect(behindFile).toBeDefined();
      expect(behindFile?.status).toBe('behind');
    });

    it('should detect diverged files when both sides modify', async () => {
      // Add file to upstream
      makeCommit(env.upstreamPath, {
        files: { 'shared.ts': '// Upstream version\nexport const source = "upstream";\n' },
        message: 'chore: add shared file',
      });

      // Add same file to fork with different content
      makeCommit(env.forkPath, {
        files: { 'shared.ts': '// Fork version\nexport const source = "fork";\n' },
        message: 'chore: add shared file',
      });

      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, { service: 'analyze' });

      const result = await runAnalyze(config);

      expect(result.success).toBe(true);
      const divergedFile = result.files.find((f) => f.path === 'shared.ts');
      expect(divergedFile).toBeDefined();
      expect(divergedFile?.status).toBe('diverged');
    });

    it('should mark pinned files as ahead', async () => {
      // Modify file in upstream
      makeCommit(env.upstreamPath, {
        files: { 'backend/src/index.ts': '// Updated backend\nexport const backend = "v2";\n' },
        message: 'chore: update backend',
      });

      // Modify same file in fork (will be pinned)
      makeCommit(env.forkPath, {
        files: { 'backend/src/index.ts': '// Fork custom backend\nexport const backend = "fork";\n' },
        message: 'chore: customize backend',
      });

      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, {
        service: 'analyze',
        pinned: ['backend/src/index.ts'],
      });

      const result = await runAnalyze(config);

      expect(result.success).toBe(true);
      const pinnedFile = result.files.find((f) => f.path === 'backend/src/index.ts');
      expect(pinnedFile).toBeDefined();
      expect(pinnedFile?.isPinned).toBe(true);
      // Pinned diverged files show as 'pinned' status
      expect(pinnedFile?.status).toBe('pinned');
    });

    it('should mark ignored files correctly', async () => {
      // Add file in ignored path to upstream
      makeCommit(env.upstreamPath, {
        files: { 'docs/guide.md': '# Guide\nThis is ignored.\n' },
        message: 'docs: add guide',
      });

      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, {
        service: 'analyze',
        ignored: ['docs/*'],
      });

      const result = await runAnalyze(config);

      expect(result.success).toBe(true);
      const ignoredFile = result.files.find((f) => f.path === 'docs/guide.md');
      expect(ignoredFile).toBeDefined();
      expect(ignoredFile?.isIgnored).toBe(true);
      expect(ignoredFile?.status).toBe('ignored');
    });
  });

  describe('sync service', () => {
    it('should sync new files from upstream', async () => {
      // Add new file to upstream
      makeCommit(env.upstreamPath, {
        files: { 'new-feature.ts': '// New feature\nexport const feature = true;\n' },
        message: 'feat: add new feature',
      });

      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, { service: 'sync' });

      const result = await runSync(config);

      expect(result.success).toBe(true);
      expect(fileExists(env.forkPath, 'new-feature.ts')).toBe(true);
      expect(readRepoFile(env.forkPath, 'new-feature.ts')).toContain('New feature');
    });

    it('should preserve pinned files during sync', async () => {
      const forkContent = '// Fork custom\nexport const custom = "fork";\n';

      // Add file to fork first (pinned)
      makeCommit(env.forkPath, {
        files: { 'custom.ts': forkContent },
        message: 'chore: add custom file',
      });

      // Add same file to upstream with different content
      makeCommit(env.upstreamPath, {
        files: { 'custom.ts': '// Upstream version\nexport const custom = "upstream";\n' },
        message: 'chore: add custom file',
      });

      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, {
        service: 'sync',
        pinned: ['custom.ts'],
      });

      const result = await runSync(config);

      expect(result.success).toBe(true);
      // Fork version should be preserved
      expect(readRepoFile(env.forkPath, 'custom.ts')).toBe(forkContent);
    });

    it('should skip ignored files during sync', async () => {
      // Add file in ignored path to upstream
      makeCommit(env.upstreamPath, {
        files: { 'docs/internal.md': '# Internal\nThis should be ignored.\n' },
        message: 'docs: add internal doc',
      });

      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, {
        service: 'sync',
        ignored: ['docs/*'],
      });

      const result = await runSync(config);

      expect(result.success).toBe(true);
      // File should NOT be added to fork
      expect(fileExists(env.forkPath, 'docs/internal.md')).toBe(false);
    });

    it('should update modified files from upstream', async () => {
      // Modify existing file in upstream
      makeCommit(env.upstreamPath, {
        files: { 'README.md': '# Updated Readme\nThis is the new version.\n' },
        message: 'docs: update readme',
      });

      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, { service: 'sync' });

      const result = await runSync(config);

      expect(result.success).toBe(true);
      expect(readRepoFile(env.forkPath, 'README.md')).toContain('Updated Readme');
    });

    it('should handle file deletions from upstream', async () => {
      // Add a file to upstream first
      makeCommit(env.upstreamPath, {
        files: { 'temp.ts': '// Temporary file\n' },
        message: 'chore: add temp file',
      });

      // Sync to get the file (use regular merge, not squash, for proper merge-base tracking)
      fetchUpstream(env.forkPath);
      let config = buildRuntimeConfig(env, { service: 'sync', mergeStrategy: 'merge' });
      await runSync(config);

      expect(fileExists(env.forkPath, 'temp.ts')).toBe(true);

      // Complete the merge commit (runSync leaves merge in progress)
      const { execSync } = await import('node:child_process');
      try {
        execSync('git commit -m "sync: merge upstream"', {
          cwd: env.forkPath,
          encoding: 'utf-8',
        });
      } catch {
        // Commit may fail if nothing to commit (merge already complete)
        // Check if we need to add and commit
        try {
          execSync('git add -A && git commit --allow-empty -m "sync: merge upstream"', {
            cwd: env.forkPath,
            encoding: 'utf-8',
          });
        } catch {
          // Ignore if still fails
        }
      }

      // Now delete it in upstream
      deleteFileAndCommit(env.upstreamPath, 'temp.ts', 'chore: remove temp file');

      fetchUpstream(env.forkPath);
      config = buildRuntimeConfig(env, { service: 'sync', mergeStrategy: 'merge' });
      const result = await runSync(config);

      expect(result.success).toBe(true);
      // File should be deleted from fork
      expect(fileExists(env.forkPath, 'temp.ts')).toBe(false);
    });

    it('should handle file renames from upstream with git mv', async () => {
      // Add a file in a subdirectory to upstream first
      makeCommit(env.upstreamPath, {
        files: { 'old-dir/moved-file.ts': '// File to be moved\nexport const value = 1;\n' },
        message: 'chore: add file in old-dir',
      });

      // Sync to get the file
      fetchUpstream(env.forkPath);
      let config = buildRuntimeConfig(env, { service: 'sync', mergeStrategy: 'merge' });
      await runSync(config);

      expect(fileExists(env.forkPath, 'old-dir/moved-file.ts')).toBe(true);

      // Complete the merge commit
      const { execSync } = await import('node:child_process');
      try {
        execSync('git add -A && git commit --allow-empty -m "sync: merge upstream"', {
          cwd: env.forkPath,
          encoding: 'utf-8',
        });
      } catch {
        // Ignore
      }

      // Now rename the file in upstream using git mv (single commit, detected as rename)
      renameFileAndCommit(
        env.upstreamPath,
        'old-dir/moved-file.ts',
        'new-dir/moved-file.ts',
        'refactor: move file to new location',
      );

      fetchUpstream(env.forkPath);
      config = buildRuntimeConfig(env, { service: 'sync', mergeStrategy: 'merge' });
      const result = await runSync(config);

      expect(result.success).toBe(true);
      // Old file should be deleted, new file should exist
      expect(fileExists(env.forkPath, 'old-dir/moved-file.ts')).toBe(false);
      expect(fileExists(env.forkPath, 'new-dir/moved-file.ts')).toBe(true);

      // Check that the rename was detected in analysis
      const renamedFile = result.files.find((f) => f.path === 'new-dir/moved-file.ts');
      expect(renamedFile).toBeDefined();
      expect(renamedFile?.status).toBe('renamed');
      expect(renamedFile?.renamedFrom).toBe('old-dir/moved-file.ts');
    });

    it('should handle file renames with squash strategy', async () => {
      const fs = await import('node:fs');
      const { getFileChanges, getMergeBase, git } = await import('../../src/utils/git');
      const { execSync } = await import('node:child_process');

      // Add a file to upstream
      makeCommit(env.upstreamPath, {
        files: { 'src/old-name.ts': '// File to rename\nexport const x = 1;\n' },
        message: 'chore: add file',
      });

      // Sync to get the file
      fetchUpstream(env.forkPath);
      let config = buildRuntimeConfig(env, { service: 'sync', mergeStrategy: 'squash' });
      await runSync(config);

      expect(fileExists(env.forkPath, 'src/old-name.ts')).toBe(true);

      // Complete the squash commit
      try {
        execSync('git add -A && git commit --allow-empty -m "sync: squash upstream"', {
          cwd: env.forkPath,
          encoding: 'utf-8',
        });
      } catch {
        // Ignore
      }

      // Rename the file in upstream
      renameFileAndCommit(env.upstreamPath, 'src/old-name.ts', 'src/new-name.ts', 'refactor: rename file');

      fetchUpstream(env.forkPath);

      // Debug: Check what getFileChanges returns
      const upstreamRef = 'cella-upstream/main';
      const mergeBase = await getMergeBase(env.forkPath, 'HEAD', upstreamRef);

      // Raw diff-tree output
      const rawDiff = await git(['diff-tree', '-r', '-M90%', '--no-commit-id', mergeBase, upstreamRef], env.forkPath);

      const upstreamChanges = await getFileChanges(env.forkPath, mergeBase, upstreamRef);

      const debugInfo1 = {
        mergeBase,
        upstreamRef,
        rawDiff,
        upstreamChanges: Array.from(upstreamChanges.entries()).map(([k, v]) => ({ path: k, ...v })),
      };
      fs.writeFileSync('/tmp/cella-test-debug1.json', JSON.stringify(debugInfo1, null, 2));

      config = buildRuntimeConfig(env, { service: 'sync', mergeStrategy: 'squash' });
      const result = await runSync(config);

      // Debug: Check what status was detected for the files
      const newFile = result.files.find((f) => f.path === 'src/new-name.ts');
      const oldFile = result.files.find((f) => f.path === 'src/old-name.ts');
      const debugInfo = {
        newFileStatus: newFile?.status,
        newFileRenamedFrom: newFile?.renamedFrom,
        oldFileStatus: oldFile?.status,
        summary: result.summary,
        allFiles: result.files.map((f) => ({ path: f.path, status: f.status, renamedFrom: f.renamedFrom })),
      };
      fs.writeFileSync('/tmp/cella-test-debug.json', JSON.stringify(debugInfo, null, 2));

      expect(result.success).toBe(true);
      expect(fileExists(env.forkPath, 'src/old-name.ts')).toBe(false);
      expect(fileExists(env.forkPath, 'src/new-name.ts')).toBe(true);
    });
  });

  describe('drifted and local detection', () => {
    it('should detect drifted files (fork-only modification)', async () => {
      // Modify an existing file only in fork (not pinned, not ignored)
      makeCommit(env.forkPath, {
        files: { 'README.md': '# Fork Customized Readme\n' },
        message: 'chore: customize readme in fork',
      });

      // Add an unrelated upstream change so there's something to analyze
      makeCommit(env.upstreamPath, {
        files: { 'new-util.ts': '// New util\n' },
        message: 'chore: add util',
      });

      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, { service: 'analyze' });

      const result = await runAnalyze(config);

      expect(result.success).toBe(true);
      const driftedFile = result.files.find((f) => f.path === 'README.md');
      expect(driftedFile).toBeDefined();
      expect(driftedFile?.status).toBe('drifted');
    });

    it('should detect local files (fork-only, never in upstream)', async () => {
      // Add a file only in fork that never existed in upstream
      makeCommit(env.forkPath, {
        files: { 'fork-only-feature.ts': '// Fork exclusive feature\nexport const local = true;\n' },
        message: 'feat: add fork-only feature',
      });

      // Add an unrelated upstream change so there's something to fetch
      makeCommit(env.upstreamPath, {
        files: { 'upstream-util.ts': '// Upstream util\n' },
        message: 'chore: add upstream util',
      });

      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, { service: 'analyze' });

      const result = await runAnalyze(config);

      expect(result.success).toBe(true);
      const localFile = result.files.find((f) => f.path === 'fork-only-feature.ts');
      expect(localFile).toBeDefined();
      expect(localFile?.status).toBe('local');
      expect(result.summary.local).toBeGreaterThanOrEqual(1);
    });
  });

  describe('merge conflicts', () => {
    it('should report conflicts when both sides edit same file differently', async () => {
      // Both sides modify the same existing file with conflicting content
      makeCommit(env.upstreamPath, {
        files: { 'README.md': '# Upstream Version\nLine from upstream\n' },
        message: 'docs: upstream readme update',
      });

      makeCommit(env.forkPath, {
        files: { 'README.md': '# Fork Version\nLine from fork\n' },
        message: 'docs: fork readme update',
      });

      fetchUpstream(env.forkPath);
      const config = buildRuntimeConfig(env, { service: 'sync' });

      const result = await runSync(config);

      // Sync should report not successful when there are real conflicts
      // (diverged files with same-line edits produce git merge conflicts)
      expect(result.conflicts.length).toBeGreaterThan(0);

      // The conflicted file should have conflict markers in worktree
      const content = readRepoFile(env.forkPath, 'README.md');
      expect(content).not.toBeNull();
      expect(content).toContain('<<<<<<<');
      expect(content).toContain('>>>>>>>');
    });
  });

  describe('multi-cycle sync', () => {
    it('should handle multiple sync cycles with merge strategy', async () => {
      const { execSync } = await import('node:child_process');

      // ── Cycle 1: upstream adds a file ──
      makeCommit(env.upstreamPath, {
        files: { 'cycle-file.ts': '// Cycle 1\nexport const v = 1;\n' },
        message: 'feat: cycle 1',
      });

      fetchUpstream(env.forkPath);
      let config = buildRuntimeConfig(env, { service: 'sync', mergeStrategy: 'merge' });
      let result = await runSync(config);

      expect(result.success).toBe(true);
      expect(fileExists(env.forkPath, 'cycle-file.ts')).toBe(true);

      // Complete the merge commit
      try {
        execSync('git add -A && git commit --allow-empty -m "sync: cycle 1"', {
          cwd: env.forkPath,
          encoding: 'utf-8',
        });
      } catch {
        // Ignore
      }

      // ── Cycle 2: upstream modifies the file ──
      makeCommit(env.upstreamPath, {
        files: { 'cycle-file.ts': '// Cycle 2\nexport const v = 2;\n' },
        message: 'feat: cycle 2',
      });

      fetchUpstream(env.forkPath);
      config = buildRuntimeConfig(env, { service: 'sync', mergeStrategy: 'merge' });
      result = await runSync(config);

      expect(result.success).toBe(true);
      expect(readRepoFile(env.forkPath, 'cycle-file.ts')).toContain('Cycle 2');

      // Complete the merge commit
      try {
        execSync('git add -A && git commit --allow-empty -m "sync: cycle 2"', {
          cwd: env.forkPath,
          encoding: 'utf-8',
        });
      } catch {
        // Ignore
      }

      // ── Cycle 3: verify analyze sees everything up to date ──
      makeCommit(env.upstreamPath, {
        files: { 'cycle-file.ts': '// Cycle 3\nexport const v = 3;\n' },
        message: 'feat: cycle 3',
      });

      fetchUpstream(env.forkPath);
      config = buildRuntimeConfig(env, { service: 'analyze' });
      const analysis = await runAnalyze(config);

      expect(analysis.success).toBe(true);
      const cycleFile = analysis.files.find((f) => f.path === 'cycle-file.ts');
      expect(cycleFile).toBeDefined();
      expect(cycleFile?.status).toBe('behind');
    });

    it('should recover from stale merge-base after squash sync', async () => {
      const { execSync } = await import('node:child_process');

      // ── Cycle 1: squash sync ──
      makeCommit(env.upstreamPath, {
        files: { 'squash-file.ts': '// Squash v1\nexport const s = 1;\n' },
        message: 'feat: squash cycle 1',
      });

      fetchUpstream(env.forkPath);
      let config = buildRuntimeConfig(env, { service: 'sync', mergeStrategy: 'squash' });
      let result = await runSync(config);

      expect(result.success).toBe(true);

      // Complete squash commit (MERGE_HEAD was removed, so this is single-parent)
      try {
        execSync('git add -A && git commit --allow-empty -m "sync: squash cycle 1"', {
          cwd: env.forkPath,
          encoding: 'utf-8',
        });
      } catch {
        // Ignore
      }

      // Verify stored ref was saved
      const { getStoredSyncRef } = await import('../../src/utils/git');
      const storedRef = await getStoredSyncRef(env.forkPath);
      expect(storedRef).not.toBeNull();

      // ── Cycle 2: upstream modifies the file ──
      makeCommit(env.upstreamPath, {
        files: { 'squash-file.ts': '// Squash v2\nexport const s = 2;\n' },
        message: 'feat: squash cycle 2',
      });

      fetchUpstream(env.forkPath);

      // The effective merge-base should use stored ref (not git's stale one)
      const { getEffectiveMergeBase } = await import('../../src/utils/git');
      const effectiveBase = await getEffectiveMergeBase(env.forkPath, 'HEAD', 'cella-upstream/main');

      // After squash, git's merge-base is stale, so stored ref should be used
      expect(effectiveBase.storedRef).not.toBeNull();

      // Sync should work correctly despite squash history
      config = buildRuntimeConfig(env, { service: 'sync', mergeStrategy: 'squash' });
      result = await runSync(config);

      expect(result.success).toBe(true);
      expect(readRepoFile(env.forkPath, 'squash-file.ts')).toContain('Squash v2');

      // File should be detected as 'behind' (not 'diverged' which was the old bug)
      const behindFile = result.files.find((f) => f.path === 'squash-file.ts');
      expect(behindFile).toBeDefined();
      expect(behindFile?.status).toBe('behind');
    });
  });
});
