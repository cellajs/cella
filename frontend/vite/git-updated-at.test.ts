import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createUpdatedAtResolver } from './git-updated-at';

describe('createUpdatedAtResolver', () => {
  const resolver = createUpdatedAtResolver(__dirname);
  const existing = path.resolve(__dirname, 'docs-frontmatter.ts');
  const alsoExisting = path.resolve(__dirname, 'git-updated-at.ts');
  const missing = path.resolve(__dirname, 'does-not-exist.xyz');

  const asMs = (iso: string | undefined) => (iso ? Date.parse(iso) : Number.NaN);

  it('returns an author-pinned date verbatim, ignoring the files', () => {
    const pin = '2020-01-02T03:04:05.000Z';
    expect(resolver.resolve([existing, alsoExisting], pin)).toBe(pin);
    // A pin wins even when no file exists at all.
    expect(resolver.resolve([missing], pin)).toBe(pin);
  });

  it('ignores a blank pin and derives from the file instead', () => {
    const result = resolver.resolve([existing], '   ');
    expect(result).not.toBe('   ');
    expect(Number.isNaN(asMs(result))).toBe(false);
  });

  it('derives a valid ISO date for an existing file (git date, else mtime)', () => {
    const result = resolver.resolve([existing]);
    expect(typeof result).toBe('string');
    expect(Number.isNaN(asMs(result))).toBe(false);
  });

  it('returns undefined when nothing resolves (no pin, no existing files)', () => {
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
