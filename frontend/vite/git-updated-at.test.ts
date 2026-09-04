import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createUpdatedAtResolver } from './git-updated-at.ts';

describe('createUpdatedAtResolver', () => {
  const resolver = createUpdatedAtResolver(import.meta.dirname);
  const existing = path.resolve(import.meta.dirname, 'docs-frontmatter.ts');
  const alsoExisting = path.resolve(import.meta.dirname, 'git-updated-at.ts');
  const missing = path.resolve(import.meta.dirname, 'does-not-exist.xyz');

  const asMs = (iso: string | undefined) => (iso ? Date.parse(iso) : Number.NaN);

  it('lets a newer commit overtake an older frontmatter stamp', () => {
    const stale = '2020-01-02T03:04:05.000Z';
    const result = resolver.resolve([existing, alsoExisting], stale);
    expect(result).not.toBe(stale);
    expect(asMs(result)).toBe(asMs(resolver.resolve([existing, alsoExisting])));
  });

  it('keeps a stamp that is newer than every file date', () => {
    const future = '2999-01-02T03:04:05.000Z';
    expect(resolver.resolve([existing, alsoExisting], future)).toBe(future);
    // With no existing file the stamp is the only candidate.
    expect(resolver.resolve([missing], future)).toBe(future);
  });

  it('ignores a blank or unparsable stamp and derives from the file instead', () => {
    for (const bad of ['   ', 'not-a-date']) {
      const result = resolver.resolve([existing], bad);
      expect(result).not.toBe(bad);
      expect(Number.isNaN(asMs(result))).toBe(false);
    }
  });

  it('derives a valid ISO date for an existing file (git date, else mtime)', () => {
    const result = resolver.resolve([existing]);
    expect(typeof result).toBe('string');
    expect(Number.isNaN(asMs(result))).toBe(false);
  });

  it('returns undefined when nothing resolves (no stamp, no existing files)', () => {
    expect(resolver.resolve([missing])).toBeUndefined();
    expect(resolver.resolve([])).toBeUndefined();
  });

  it('skips missing files but still resolves from the existing ones', () => {
    const result = resolver.resolve([missing, existing]);
    expect(Number.isNaN(asMs(result))).toBe(false);
  });

  it('takes the newest date across the page and its imports', () => {
    const combined = asMs(resolver.resolve([existing, alsoExisting]));
    const a = asMs(resolver.resolve([existing]));
    const b = asMs(resolver.resolve([alsoExisting]));
    expect(combined).toBe(Math.max(a, b));
  });
});
