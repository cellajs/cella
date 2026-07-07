import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';
import { parse, stringify } from 'yaml';

/**
 * Dev-only write-back endpoint for the docs pages table (`POST /__docs-edit`).
 *
 * Since #855 pages are plain `src/content/docs/**\/*.{md,mdx}` files, not a DB
 * entity — so "editing" a page means rewriting its frontmatter (and, for
 * reparenting, moving the file on disk). This plugin is the counterpart to
 * `docsFrontmatter()`: that one reads the frontmatter index, this one mutates
 * the source files. It only exists on the dev server (`apply: 'serve'`); in a
 * production build the MDX is bundled and the editing UI is gated off.
 *
 * A page's parent is derived from its directory, so reparenting physically
 * moves the file/directory. After any write, the `docsFrontmatter` watcher
 * picks up the change and triggers a full reload, which is what refreshes the
 * table (there is no client cache to invalidate).
 *
 * Sibling of `locales-hmr.ts`, which also writes files from a Vite plugin.
 */

/** Same frontmatter delimiter the read-side index uses (vite/docs-frontmatter.ts). */
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/;

const MD_EXTENSIONS = ['.md', '.mdx'] as const;

/** Editable frontmatter fields, mapped from the table's edit ops. */
export interface DocEditOps {
  title?: string;
  renderMode?: string;
  draft?: boolean;
  displayOrder?: number;
  parentId?: string | null;
}

/**
 * Resolve a page slug to its source file. A slug maps to the first existing of
 * `<slug>.md(x)` (leaf) or `<slug>/index.md(x)` (directory page). Returns null
 * if none exists.
 */
export function resolveSlugPath(contentDir: string, slug: string): string | null {
  const rel = slug.split('/').join(path.sep);
  const candidates = [
    ...MD_EXTENSIONS.map((ext) => path.join(contentDir, rel + ext)),
    ...MD_EXTENSIONS.map((ext) => path.join(contentDir, rel, `index${ext}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Whether a resolved path is a directory page (`.../index.md(x)`). */
function isIndexFile(file: string): boolean {
  return /(^|[\\/])index\.mdx?$/.test(file);
}

/**
 * Merge `patch` into a file's YAML frontmatter and return the new source,
 * leaving the body untouched. Adds a frontmatter block if the file lacks one.
 * `undefined` values in `patch` are ignored; everything else is written as-is.
 */
export function applyFrontmatter(source: string, patch: Record<string, unknown>): string {
  const match = FRONTMATTER_BLOCK.exec(source);
  const current = match ? ((parse(match[1]) as Record<string, unknown> | null) ?? {}) : {};
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) next[key] = value;
  }
  const block = `---\n${stringify(next)}---\n`;
  if (!match) return `${block}\n${source}`;
  return block + source.slice(match[0].length).replace(/^\r?\n/, '\n');
}

/** Slug → its derived parent slug (`a/b/c` → `a/b`, `a` → null). */
function parentOf(slug: string): string | null {
  const idx = slug.lastIndexOf('/');
  return idx === -1 ? null : slug.slice(0, idx);
}

/**
 * Move a page under a new parent (or to the root when `newParentId` is null),
 * returning the moved page's new file path. Promotes a leaf target parent to a
 * directory page first so children can live beside its `index` file.
 *
 * TODO [#16]: reparenting changes the moved page's slug (its URL), but inbound
 * internal links still point at the old slug and are left untouched — they 404
 * until fixed by hand. Auto-rewrite links to the old slug across the docs
 * content (and imported repo docs) as part of the move.
 */
function reparent(contentDir: string, slug: string, newParentId: string | null): string {
  const srcPath = resolveSlugPath(contentDir, slug);
  if (!srcPath) throw new Error(`Unknown page: ${slug}`);

  // Promote a leaf parent (`p.md`) to a directory page (`p/index.md`) so the
  // moved page has a directory to live in.
  if (newParentId) {
    const parentPath = resolveSlugPath(contentDir, newParentId);
    if (!parentPath) throw new Error(`Unknown parent page: ${newParentId}`);
    if (!isIndexFile(parentPath)) {
      const parentDir = path.join(contentDir, newParentId.split('/').join(path.sep));
      mkdirSync(parentDir, { recursive: true });
      renameSync(parentPath, path.join(parentDir, `index${path.extname(parentPath)}`));
    }
  }

  const destParentDir = newParentId ? path.join(contentDir, newParentId.split('/').join(path.sep)) : contentDir;
  const base = slug.split('/').pop() as string;
  const ext = path.extname(srcPath);

  if (isIndexFile(srcPath)) {
    // Directory page: move the whole directory; children move with it.
    const srcDir = path.dirname(srcPath);
    const destDir = path.join(destParentDir, base);
    mkdirSync(path.dirname(destDir), { recursive: true });
    renameSync(srcDir, destDir);
    return path.join(destDir, `index${ext}`);
  }

  // Leaf page: move the single file.
  mkdirSync(destParentDir, { recursive: true });
  const destPath = path.join(destParentDir, `${base}${ext}`);
  renameSync(srcPath, destPath);
  return destPath;
}

/**
 * Apply an edit to a page: optionally reparent (move files), then merge the
 * frontmatter fields and stamp `updatedAt`. Returns the final file path.
 */
export function editDocPage(contentDir: string, slug: string, ops: DocEditOps, now: string): string {
  let filePath = resolveSlugPath(contentDir, slug);
  if (!filePath) throw new Error(`Unknown page: ${slug}`);

  if (ops.parentId !== undefined && ops.parentId !== parentOf(slug)) {
    filePath = reparent(contentDir, slug, ops.parentId);
  }

  const patch: Record<string, unknown> = { updatedAt: now };
  if (ops.title !== undefined) patch.title = ops.title;
  if (ops.renderMode !== undefined) patch.renderMode = ops.renderMode;
  if (ops.draft !== undefined) patch.draft = ops.draft;
  if (ops.displayOrder !== undefined) patch.order = ops.displayOrder;

  writeFileSync(filePath, applyFrontmatter(readFileSync(filePath, 'utf8'), patch), 'utf8');
  return filePath;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export function docsEditor(): Plugin {
  let contentDir: string;

  return {
    name: 'docs-editor',
    apply: 'serve',
    configResolved(config) {
      contentDir = path.resolve(config.root, 'src/content/docs');
    },
    configureServer(server) {
      server.middlewares.use('/__docs-edit', async (req: Connect.IncomingMessage, res: ServerResponse, next) => {
        if (req.method !== 'POST') return next();
        try {
          const { slug, ops } = JSON.parse(await readBody(req)) as { slug?: string; ops?: DocEditOps };
          if (!slug || !ops) throw new Error('Missing slug or ops');
          // Guard against path escapes: slugs are content-root relative.
          if (slug.includes('..') || (typeof ops.parentId === 'string' && ops.parentId.includes('..'))) {
            throw new Error('Invalid slug');
          }
          const file = editDocPage(contentDir, slug, ops, new Date().toISOString());
          server.config.logger.info(`[docs-editor] edited ${path.relative(contentDir, file)}`);
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          server.config.logger.error(`[docs-editor] ${message}`);
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: message }));
        }
      });
    },
  };
}
