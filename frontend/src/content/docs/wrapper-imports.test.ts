import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Docs pages can import repo docs (e.g. cella/TESTING.md) as their body — a broken
 * import only fails at frontend build time, which PR CI does not run. This guard
 * checks every relative import in src/content/docs resolves to an existing file.
 */

const contentRoot = path.dirname(fileURLToPath(import.meta.url));

function collectPages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectPages(full);
    return /\.(md|mdx)$/.test(entry.name) ? [full] : [];
  });
}

describe('docs content wrapper imports', () => {
  const pages = collectPages(contentRoot);

  it('finds docs pages', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it('every relative import in a docs page resolves to an existing file', () => {
    const broken: string[] = [];
    // Only .mdx pages can have real imports (.md compiles as plain markdown), and
    // fenced code blocks may contain example import statements — skip both.
    for (const page of pages.filter((p) => p.endsWith('.mdx'))) {
      const source = readFileSync(page, 'utf8').replace(/^```.*?^```/gms, '');
      for (const match of source.matchAll(/^import\s[^\n]*?from\s+['"]([^'"]+)['"]/gm)) {
        const specifier = match[1];
        if (!specifier.startsWith('.')) continue;
        if (!existsSync(path.resolve(path.dirname(page), specifier))) {
          broken.push(`${path.relative(contentRoot, page)} → ${specifier}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
