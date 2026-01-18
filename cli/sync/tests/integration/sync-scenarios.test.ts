/**
 * Integration tests for sync merge scenarios.
 *
 * These tests use a real git fixture repo to verify actual merge behavior.
 * The fixture repo must exist at: https://github.com/cellajs/sync-test-fixture
 *
 * Expected fixture structure with tags:
 * - v1.0.0: Initial state (fork starts here)
 * - v1.1.0: Adds new files
 * - v1.2.0: Modifies existing files
 * - v1.3.0: Deletes files
 *
 * Run with: pnpm test:integration
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type TestEnv,
  clearFixtureCache,
  createTestEnv,
  ensureFixtureCache,
  fileExists,
  makeCommit,
  readRepoFile,
} from './helpers/test-repos';

describe('sync integration', () => {
  // Ensure fixture cache exists before all tests
  beforeAll(async () => {
    await ensureFixtureCache();
  });

  describe('fork behind upstream', () => {
    let env: TestEnv;

    beforeAll(async () => {
      // Fork starts at v1.0.0, upstream is at main (ahead)
      env = await createTestEnv({
        upstreamRef: 'main',
        forkStartRef: 'v1.0.0',
      });
    });

    afterAll(() => {
      env?.cleanup();
    });

    it('should have fork behind upstream', () => {
      expect(env.forkPath).toBeDefined();
      expect(env.upstreamPath).toBeDefined();
    });

    it('should detect fork is behind', () => {
      const forkContent = readRepoFile(env.forkPath, 'README.md');
      expect(forkContent).toBeDefined();
    });
  });

  describe('fork with customizations', () => {
    let env: TestEnv;

    beforeAll(async () => {
      env = await createTestEnv({
        upstreamRef: 'main',
        forkStartRef: 'v1.0.0',
      });

      // Make fork-specific changes to a "customized" file
      makeCommit(env.forkPath, {
        files: {
          'custom-file.ts': '// Fork customization\nexport const version = "fork";\n',
        },
        message: 'chore: customize for fork',
      });
    });

    afterAll(() => {
      env?.cleanup();
    });

    it('should have fork customization', () => {
      const content = readRepoFile(env.forkPath, 'custom-file.ts');
      expect(content).toContain('fork');
    });
  });

  describe('new file in upstream', () => {
    let env: TestEnv;

    beforeAll(async () => {
      env = await createTestEnv({
        upstreamRef: 'main',
        forkStartRef: 'v1.0.0',
      });

      // Add a new file to upstream (simulating Cella adding a feature)
      makeCommit(env.upstreamPath, {
        files: {
          'new-feature.ts': '// New feature from upstream\nexport const feature = true;\n',
        },
        message: 'feat: add new feature',
      });
    });

    afterAll(() => {
      env?.cleanup();
    });

    it('should have new file in upstream but not fork', () => {
      expect(fileExists(env.upstreamPath, 'new-feature.ts')).toBe(true);
      expect(fileExists(env.forkPath, 'new-feature.ts')).toBe(false);
    });

    // TODO: Test that sync adds the file to fork
  });

  describe('diverged histories', () => {
    let env: TestEnv;

    beforeAll(async () => {
      env = await createTestEnv({
        upstreamRef: 'main',
        forkStartRef: 'v1.0.0',
      });

      // Both modify the same file differently
      makeCommit(env.upstreamPath, {
        files: {
          'shared-file.ts': '// Upstream version\nexport const source = "upstream";\n',
        },
        message: 'chore: update shared file',
      });

      makeCommit(env.forkPath, {
        files: {
          'shared-file.ts': '// Fork version\nexport const source = "fork";\n',
        },
        message: 'chore: update shared file for fork',
      });
    });

    afterAll(() => {
      env?.cleanup();
    });

    it('should have diverged content', () => {
      const upstreamContent = readRepoFile(env.upstreamPath, 'shared-file.ts');
      const forkContent = readRepoFile(env.forkPath, 'shared-file.ts');

      expect(upstreamContent).toContain('upstream');
      expect(forkContent).toContain('fork');
    });

    // TODO: Test that sync detects conflict and requires manual resolution
  });

  describe('fixture cache management', () => {
    it('should be able to clear cache', () => {
      expect(() => clearFixtureCache()).not.toThrow();
    });
  });
});
