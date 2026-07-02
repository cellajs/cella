/**
 * Unit tests for override matching utilities.
 *
 * Tests isIgnored, isPinned, and isUnderAnyFolder with the
 * shared path-or-folder-prefix model.
 */
import { describe, expect, it } from 'vitest';
import type { CellaCliConfig } from '../src/config/types';
import { isIgnored, isPinned, isUnderAnyFolder } from '../src/utils/overrides';

/** Helper to build a minimal config with overrides */
function buildConfig(overrides: { pinned?: string[]; ignored?: string[] }): CellaCliConfig {
  return {
    settings: {
      upstreamUrl: 'test',
      upstreamBranch: 'main',
    },
    overrides: {
      pinned: overrides.pinned ?? [],
      ignored: overrides.ignored ?? [],
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
      const config = buildConfig({ ignored: ['docs', 'test'] });
      expect(isIgnored('docs/guide.md', config)).toBe(true);
      expect(isIgnored('docs/api/ref.md', config)).toBe(true);
      expect(isIgnored('test/unit.ts', config)).toBe(true);
      expect(isIgnored('src/index.ts', config)).toBe(false);
    });

    it('should return false with empty ignored list', () => {
      const config = buildConfig({ ignored: [] });
      expect(isIgnored('any/file.ts', config)).toBe(false);
    });

    it('should handle exact path in ignored folders', () => {
      const config = buildConfig({ ignored: ['cella.config.ts'] });
      expect(isIgnored('cella.config.ts', config)).toBe(true);
      expect(isIgnored('other.config.ts', config)).toBe(false);
    });
  });

  describe('isPinned', () => {
    it('should match exact pinned files', () => {
      const config = buildConfig({ pinned: ['backend/src/index.ts', 'frontend/src/app.tsx'] });
      expect(isPinned('backend/src/index.ts', config)).toBe(true);
      expect(isPinned('frontend/src/app.tsx', config)).toBe(true);
      expect(isPinned('backend/src/utils.ts', config)).toBe(false);
    });

    it('should match files nested under pinned folders', () => {
      const config = buildConfig({ pinned: ['frontend/src/modules/home'] });
      expect(isPinned('frontend/src/modules/home/home-page.tsx', config)).toBe(true);
      expect(isPinned('frontend/src/modules/home/onboarding/onboarding-config.ts', config)).toBe(true);
      expect(isPinned('frontend/src/modules/marketing/logo.tsx', config)).toBe(false);
    });

    it('should auto-pin package.json files', () => {
      const config = buildConfig({ pinned: [] });
      expect(isPinned('package.json', config)).toBe(true);
      expect(isPinned('frontend/package.json', config)).toBe(true);
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
        },
      };
      expect(isPinned('any/file.ts', config)).toBe(false);
      expect(isIgnored('any/file.ts', config)).toBe(false);
    });
  });
});
