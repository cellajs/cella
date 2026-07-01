import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Supply-chain guard: the published bundle must not use `child_process` (shell access).
 *
 * create-cella scaffolds projects using isomorphic-git and a direct tarball download
 * (nanotar), never the git binary or a package manager, so Socket's `shellAccess`
 * capability stays off the package. This test locks that in by scanning the built
 * bundle for any shell/child_process reference.
 */
describe('no shell access', () => {
  const distPath = resolve(import.meta.dirname, '..', 'dist', 'index.js');

  it('has a built bundle to check', () => {
    expect(existsSync(distPath)).toBe(true);
  });

  it.runIf(existsSync(distPath))('does not reference child_process in the bundle', () => {
    const bundle = readFileSync(distPath, 'utf8');
    expect(bundle).not.toContain('child_process');
    expect(bundle).not.toContain('nano-spawn');
    expect(bundle).not.toContain('execFile');
  });
});
