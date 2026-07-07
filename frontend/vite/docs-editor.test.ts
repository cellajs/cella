import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { applyFrontmatter, editDocPage, resolveSlugPath } from './docs-editor';

const NOW = '2026-07-07T00:00:00.000Z';

describe('applyFrontmatter', () => {
  it('merges keys and preserves the body', () => {
    const src = '---\ntitle: Old\norder: 1\n---\n\n# Body\n\ntext\n';
    const out = applyFrontmatter(src, { title: 'New', updatedAt: NOW });
    const fm = parse(out.split('---')[1]) as Record<string, unknown>;
    expect(fm).toMatchObject({ title: 'New', order: 1, updatedAt: NOW });
    expect(out).toContain('# Body\n\ntext\n');
  });

  it('ignores undefined patch values', () => {
    const out = applyFrontmatter('---\ntitle: Keep\n---\nbody', { title: undefined, draft: true });
    const fm = parse(out.split('---')[1]) as Record<string, unknown>;
    expect(fm).toEqual({ title: 'Keep', draft: true });
  });

  it('adds a frontmatter block when the file has none', () => {
    const out = applyFrontmatter('# Just a body\n', { title: 'Added' });
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toContain('# Just a body');
  });
});

describe('file operations', () => {
  let contentDir: string;

  beforeEach(() => {
    contentDir = mkdtempSync(path.join(tmpdir(), 'docs-editor-'));
    // architecture/          (directory page with a child)
    //   index.md
    //   overview.md
    // guides.md              (leaf page, no directory)
    mkdirSync(path.join(contentDir, 'architecture'), { recursive: true });
    writeFileSync(path.join(contentDir, 'architecture', 'index.md'), '---\ntitle: Architecture\norder: 0\n---\nbody\n');
    writeFileSync(path.join(contentDir, 'architecture', 'overview.md'), '---\ntitle: Overview\norder: 1\n---\nbody\n');
    writeFileSync(path.join(contentDir, 'guides.md'), '---\ntitle: Guides\norder: 2\n---\nbody\n');
  });

  afterEach(() => rmSync(contentDir, { recursive: true, force: true }));

  it('resolves leaf and directory-page slugs', () => {
    expect(resolveSlugPath(contentDir, 'guides')).toBe(path.join(contentDir, 'guides.md'));
    expect(resolveSlugPath(contentDir, 'architecture')).toBe(path.join(contentDir, 'architecture', 'index.md'));
    expect(resolveSlugPath(contentDir, 'architecture/overview')).toBe(
      path.join(contentDir, 'architecture', 'overview.md'),
    );
    expect(resolveSlugPath(contentDir, 'missing')).toBeNull();
  });

  it('rewrites frontmatter fields and stamps updatedAt', () => {
    editDocPage(contentDir, 'guides', { title: 'Guides!', renderMode: 'overview', draft: true, displayOrder: 5 }, NOW);
    const fm = parse(readFileSync(path.join(contentDir, 'guides.md'), 'utf8').split('---')[1]) as Record<
      string,
      unknown
    >;
    expect(fm).toMatchObject({ title: 'Guides!', renderMode: 'overview', draft: true, order: 5, updatedAt: NOW });
  });

  it('reparents a leaf page by moving its file into the target directory', () => {
    editDocPage(contentDir, 'guides', { parentId: 'architecture' }, NOW);
    expect(existsSync(path.join(contentDir, 'guides.md'))).toBe(false);
    expect(existsSync(path.join(contentDir, 'architecture', 'guides.md'))).toBe(true);
  });

  it('reparents a directory page by moving its whole subtree', () => {
    // Move `architecture` (with its `overview` child) under `guides`, promoting
    // the `guides` leaf to a directory page first.
    editDocPage(contentDir, 'architecture', { parentId: 'guides' }, NOW);
    expect(existsSync(path.join(contentDir, 'guides', 'index.md'))).toBe(true); // promoted
    expect(existsSync(path.join(contentDir, 'guides', 'architecture', 'index.md'))).toBe(true);
    expect(existsSync(path.join(contentDir, 'guides', 'architecture', 'overview.md'))).toBe(true); // child moved with it
    expect(existsSync(path.join(contentDir, 'architecture'))).toBe(false);
  });

  it('reparents to the root when parentId is null', () => {
    editDocPage(contentDir, 'architecture/overview', { parentId: null }, NOW);
    expect(existsSync(path.join(contentDir, 'overview.md'))).toBe(true);
    expect(existsSync(path.join(contentDir, 'architecture', 'overview.md'))).toBe(false);
  });
});
