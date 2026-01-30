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
  });
});
