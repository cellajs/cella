/**
 * Unit tests for override matching utilities.
 *
 * Tests isIgnored, isPinned, and isUnderAnyFolder with the
 * folder-prefix / exact-file model.
 */
import { describe, expect, it } from 'vitest';
import type { CellaCliConfig } from '../src/config/types';
import { findIgnoredFiles, findPinnedFiles, isIgnored, isPinned, isUnderAnyFolder } from '../src/utils/overrides';

/** Helper to build a minimal config with overrides */
function buildConfig(overrides: { pinnedFiles?: string[]; ignoredFolders?: string[] }): CellaCliConfig {
  return {
    settings: {
      upstreamUrl: 'test',
      upstreamBranch: 'main',
      workingBranch: 'main',
      mergeStrategy: 'squash',
    },
    overrides: {
      pinnedFiles: overrides.pinnedFiles ?? [],
      ignoredFolders: overrides.ignoredFolders ?? [],
    },
  };
}

describe('overrides', () => {
  describe('isUnderAnyFolder', () => {
    it('should match files nested under a folder', () => {
      expect(isUnderAnyFolder('docs/guide.md', ['docs'])).toBe(true);
      expect(isUnderAnyFolder('docs/api/ref.md', ['docs'])).toBe(true);
    });

    it('should match an exact path entry', () => {
      expect(isUnderAnyFolder('README.md', ['README.md'])).toBe(true);
      expect(isUnderAnyFolder('READMExmd', ['README.md'])).toBe(false);
    });

    it('should tolerate trailing slashes on entries', () => {
      expect(isUnderAnyFolder('bench/run.ts', ['bench/'])).toBe(true);
    });

    it('should not match unrelated or prefix-only paths', () => {
      expect(isUnderAnyFolder('src/index.ts', ['docs'])).toBe(false);
      expect(isUnderAnyFolder('docs-extra/file.ts', ['docs'])).toBe(false);
    });
  });

  describe('isIgnored', () => {
    it('should match files inside ignored folders', () => {
      const config = buildConfig({ ignoredFolders: ['docs', 'test'] });
      expect(isIgnored('docs/guide.md', config)).toBe(true);
      expect(isIgnored('docs/api/ref.md', config)).toBe(true);
      expect(isIgnored('test/unit.ts', config)).toBe(true);
      expect(isIgnored('src/index.ts', config)).toBe(false);
    });

    it('should return false with empty ignored list', () => {
      const config = buildConfig({ ignoredFolders: [] });
      expect(isIgnored('any/file.ts', config)).toBe(false);
    });

    it('should handle exact path in ignored folders', () => {
      const config = buildConfig({ ignoredFolders: ['cella.config.ts'] });
      expect(isIgnored('cella.config.ts', config)).toBe(true);
      expect(isIgnored('other.config.ts', config)).toBe(false);
    });
  });

  describe('isPinned', () => {
    it('should match exact pinned files', () => {
      const config = buildConfig({ pinnedFiles: ['backend/src/index.ts', 'frontend/src/app.tsx'] });
      expect(isPinned('backend/src/index.ts', config)).toBe(true);
      expect(isPinned('frontend/src/app.tsx', config)).toBe(true);
      expect(isPinned('backend/src/utils.ts', config)).toBe(false);
    });

    it('should auto-pin package.json files', () => {
      const config = buildConfig({ pinnedFiles: [] });
      expect(isPinned('package.json', config)).toBe(true);
      expect(isPinned('frontend/package.json', config)).toBe(true);
    });

    it('should return false with empty pinned list', () => {
      const config = buildConfig({ pinnedFiles: [] });
      expect(isPinned('any/file.ts', config)).toBe(false);
    });

    it('should return false with undefined overrides', () => {
      const config: CellaCliConfig = {
        settings: {
          upstreamUrl: 'test',
          upstreamBranch: 'main',
          workingBranch: 'main',
          mergeStrategy: 'squash',
        },
      };
      expect(isPinned('any/file.ts', config)).toBe(false);
      expect(isIgnored('any/file.ts', config)).toBe(false);
    });
  });

  describe('findIgnoredFiles', () => {
    it('should filter file list to only ignored files', () => {
      const config = buildConfig({ ignoredFolders: ['docs'] });
      const files = ['src/index.ts', 'docs/guide.md', 'docs/api/ref.md', 'README.md'];
      const ignored = findIgnoredFiles(files, config);
      expect(ignored).toEqual(['docs/guide.md', 'docs/api/ref.md']);
    });

    it('should return empty array when nothing matches', () => {
      const config = buildConfig({ ignoredFolders: ['nonexistent'] });
      const files = ['src/index.ts', 'README.md'];
      expect(findIgnoredFiles(files, config)).toEqual([]);
    });
  });

  describe('findPinnedFiles', () => {
    it('should filter file list to only pinned files', () => {
      const config = buildConfig({ pinnedFiles: ['README.md'] });
      const files = ['src/index.ts', 'README.md', 'package.json', 'tsconfig.json'];
      const pinned = findPinnedFiles(files, config);
      // package.json is auto-pinned
      expect(pinned).toEqual(['README.md', 'package.json']);
    });
  });
});
