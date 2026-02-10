/**
 * Unit tests for override matching utilities.
 *
 * Tests isIgnored, isPinned, matchPattern, and isGlobPattern
 * with various glob patterns and edge cases.
 */
import { describe, expect, it } from 'vitest';
import type { CellaCliConfig } from '../src/config/types';
import {
  findIgnoredFiles,
  findPinnedFiles,
  isGlobPattern,
  isIgnored,
  isPinned,
  matchPattern,
} from '../src/utils/overrides';

/** Helper to build a minimal config with overrides */
function buildConfig(overrides: { pinned?: string[]; ignored?: string[] }): CellaCliConfig {
  return {
    settings: {
      upstreamUrl: 'test',
      upstreamBranch: 'main',
      forkBranch: 'main',
      mergeStrategy: 'squash',
    },
    overrides: {
      pinned: overrides.pinned ?? [],
      ignored: overrides.ignored ?? [],
    },
  };
}

describe('overrides', () => {
  describe('isGlobPattern', () => {
    it('should detect * as glob', () => {
      expect(isGlobPattern('src/*')).toBe(true);
    });

    it('should detect ** as glob', () => {
      expect(isGlobPattern('src/**')).toBe(true);
    });

    it('should detect ? as glob', () => {
      expect(isGlobPattern('src/file?.ts')).toBe(true);
    });

    it('should not flag exact paths as glob', () => {
      expect(isGlobPattern('src/index.ts')).toBe(false);
      expect(isGlobPattern('README.md')).toBe(false);
      expect(isGlobPattern('backend/src/db/schema.ts')).toBe(false);
    });
  });

  describe('matchPattern', () => {
    it('should match exact file paths', () => {
      expect(matchPattern('src/index.ts', 'src/index.ts')).toBe(true);
      expect(matchPattern('README.md', 'README.md')).toBe(true);
    });

    it('should not match different exact paths', () => {
      expect(matchPattern('src/index.ts', 'src/other.ts')).toBe(false);
      expect(matchPattern('src/index.ts', 'index.ts')).toBe(false);
    });

    it('should match single-level wildcard (*)', () => {
      expect(matchPattern('src/index.ts', 'src/*')).toBe(true);
      expect(matchPattern('src/utils.ts', 'src/*')).toBe(true);
    });

    it('should not match nested paths with single-level wildcard', () => {
      expect(matchPattern('src/deep/index.ts', 'src/*')).toBe(false);
    });

    it('should match recursive wildcard (**)', () => {
      expect(matchPattern('src/index.ts', 'src/**')).toBe(true);
      expect(matchPattern('src/deep/nested/file.ts', 'src/**')).toBe(true);
      expect(matchPattern('src/a/b/c/d.ts', 'src/**')).toBe(true);
    });

    it('should match ? as single character', () => {
      expect(matchPattern('src/file1.ts', 'src/file?.ts')).toBe(true);
      expect(matchPattern('src/fileA.ts', 'src/file?.ts')).toBe(true);
    });

    it('should not match ? for zero or multiple characters', () => {
      expect(matchPattern('src/file.ts', 'src/file?.ts')).toBe(false);
      expect(matchPattern('src/file12.ts', 'src/file?.ts')).toBe(false);
    });

    it('should handle mixed wildcards', () => {
      expect(matchPattern('docs/api/v1/users.md', 'docs/**/*.md')).toBe(true);
      // docs/guide.md has no subdirectory between docs/ and *.md, so ** matches empty string
      // but the slash after ** means at least one dir level is needed
      expect(matchPattern('docs/guide.md', 'docs/**')).toBe(true);
      expect(matchPattern('docs/api/guide.md', 'docs/**')).toBe(true);
    });

    it('should handle pattern with special regex characters', () => {
      // Dots, brackets, etc. in paths should be escaped
      expect(matchPattern('file.test.ts', 'file.test.ts')).toBe(true);
      expect(matchPattern('file-test.ts', 'file.test.ts')).toBe(false);
    });
  });

  describe('isIgnored', () => {
    it('should match files against ignored patterns', () => {
      const config = buildConfig({ ignored: ['docs/**', 'test/*'] });
      expect(isIgnored('docs/guide.md', config)).toBe(true);
      expect(isIgnored('docs/api/ref.md', config)).toBe(true);
      expect(isIgnored('test/unit.ts', config)).toBe(true);
      expect(isIgnored('src/index.ts', config)).toBe(false);
    });

    it('should return false with empty ignored list', () => {
      const config = buildConfig({ ignored: [] });
      expect(isIgnored('any/file.ts', config)).toBe(false);
    });

    it('should handle exact path in ignored', () => {
      const config = buildConfig({ ignored: ['cella.config.ts'] });
      expect(isIgnored('cella.config.ts', config)).toBe(true);
      expect(isIgnored('other.config.ts', config)).toBe(false);
    });
  });

  describe('isPinned', () => {
    it('should match files against pinned patterns', () => {
      const config = buildConfig({ pinned: ['backend/src/index.ts', 'frontend/src/app.tsx'] });
      expect(isPinned('backend/src/index.ts', config)).toBe(true);
      expect(isPinned('frontend/src/app.tsx', config)).toBe(true);
      expect(isPinned('backend/src/utils.ts', config)).toBe(false);
    });

    it('should return false with empty pinned list', () => {
      const config = buildConfig({ pinned: [] });
      expect(isPinned('any/file.ts', config)).toBe(false);
    });

    it('should return false with undefined overrides', () => {
      const config: CellaCliConfig = {
        settings: {
          upstreamUrl: 'test',
          upstreamBranch: 'main',
          forkBranch: 'main',
          mergeStrategy: 'squash',
        },
      };
      expect(isPinned('any/file.ts', config)).toBe(false);
      expect(isIgnored('any/file.ts', config)).toBe(false);
    });
  });

  describe('findIgnoredFiles', () => {
    it('should filter file list to only ignored files', () => {
      const config = buildConfig({ ignored: ['docs/**'] });
      const files = ['src/index.ts', 'docs/guide.md', 'docs/api/ref.md', 'README.md'];
      const ignored = findIgnoredFiles(files, config);
      expect(ignored).toEqual(['docs/guide.md', 'docs/api/ref.md']);
    });

    it('should return empty array when nothing matches', () => {
      const config = buildConfig({ ignored: ['nonexistent/**'] });
      const files = ['src/index.ts', 'README.md'];
      expect(findIgnoredFiles(files, config)).toEqual([]);
    });
  });

  describe('findPinnedFiles', () => {
    it('should filter file list to only pinned files', () => {
      const config = buildConfig({ pinned: ['README.md', 'package.json'] });
      const files = ['src/index.ts', 'README.md', 'package.json', 'tsconfig.json'];
      const pinned = findPinnedFiles(files, config);
      expect(pinned).toEqual(['README.md', 'package.json']);
    });
  });
});
