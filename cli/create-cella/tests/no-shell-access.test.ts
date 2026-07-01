import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Supply-chain guard: create-cella must not use `child_process` (shell access).
 *
 * Scaffolding relies on isomorphic-git and a direct tarball download (nanotar),
 * never the git binary or a package manager, so Socket's `shellAccess` capability
 * stays off the published package. This test scans the source tree (build-independent)
 * for any shell/child_process reference so a regression fails CI.
 */
describe('no shell access', () => {
  const srcDir = resolve(import.meta.dirname, '..', 'src');

  function collectSources(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...collectSources(full));
      else if (entry.name.endsWith('.ts')) files.push(full);
    }
    return files;
  }

  it('does not import child_process or a spawn helper', () => {
    // Match real imports/requires, not prose in doc comments.
    const forbidden = [
      /\bfrom\s+['"]node:child_process['"]/,
      /\brequire\(\s*['"](?:node:)?child_process['"]\s*\)/,
      /\bfrom\s+['"]nano-spawn['"]/,
    ];
    const offenders: string[] = [];

    for (const file of collectSources(srcDir)) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        if (pattern.test(content)) offenders.push(`${file}: ${pattern}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
