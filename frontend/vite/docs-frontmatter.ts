import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import GithubSlugger from 'github-slugger';
import type { Plugin } from 'vite';
import { parse } from 'yaml';

/**
 * Virtual module `virtual:docs-frontmatter`: a build-time index of all docs pages
 * (src/content/docs md/mdx) keyed by content-root-relative module path, each entry
 * holding the page's parsed frontmatter and extracted headings.
 *
 * Parsing here, without importing page modules, keeps each page body in its own
 * code-split chunk and lets the "on this page" aside render before the body chunk loads.
 * Headings must produce the same ids as the mdx pipeline (rehype-slug with the `spy-`
 * prefix, vite.config.ts): same slugger (github-slugger), fresh instance per source
 * file, and the leading h1 of repo docs skipped (mirrors remarkStripRepoDocH1).
 */

const VIRTUAL_ID = 'virtual:docs-frontmatter';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** Matches the rehype-slug prefix configured in vite.config.ts. */
const ID_PREFIX = 'spy-';

const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/;
const FENCED_CODE_BLOCK = /^(```|~~~).*?^\1.*?$/gms;
const HEADING_LINE = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm;
/** Relative md imports in .mdx wrappers (e.g. `import Content from '../../cella/TESTING.md'`). */
const RELATIVE_MD_IMPORT = /^import\s[^\n]*?from\s+['"](\.[^'"]+\.md)['"]/gm;

export type DocHeading = { id: string; text: string; depth: number };
export type DocPageEntry = { frontmatter: unknown; headings: DocHeading[] };

function collectPages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectPages(full);
    return /\.(md|mdx)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Heading text → the text content rehype-slug sees after the markdown compiles:
 * inline code/emphasis markers drop away, links and images reduce to their label.
 */
function toTextContent(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images → label
    .replace(/`([^`]*)`/g, '$1') // inline code -> content
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // strong -> content
    .replace(/(\*|\b_)(.*?)\1/g, '$2') // emphasis -> content
    .trim();
}

/**
 * Extract headings from markdown source with the same ids rehype-slug assigns.
 * `stripLeadingH1` mirrors remarkStripRepoDocH1: repo docs' first h1 never renders.
 * Exported for the slug-agreement unit test.
 */
export function extractHeadings(source: string, { stripLeadingH1 = false } = {}): DocHeading[] {
  const body = source.replace(FRONTMATTER_BLOCK, '').replace(FENCED_CODE_BLOCK, '');
  const slugger = new GithubSlugger();
  const headings: DocHeading[] = [];
  let firstHeading = true;

  for (const match of body.matchAll(HEADING_LINE)) {
    const depth = match[1].length;
    const skip = stripLeadingH1 && firstHeading && depth === 1;
    firstHeading = false;
    if (skip) continue;
    const text = toTextContent(match[2]);
    headings.push({ id: ID_PREFIX + slugger.slug(text), text, depth });
  }
  return headings;
}

function parseFrontmatter(source: string): unknown {
  const match = FRONTMATTER_BLOCK.exec(source);
  return match ? parse(match[1]) : {};
}

/** Relative .md import targets of an .mdx wrapper, resolved to absolute paths. */
function importTargets(file: string, source: string): string[] {
  if (!file.endsWith('.mdx')) return [];
  return [...source.matchAll(RELATIVE_MD_IMPORT)].map((m) => path.resolve(path.dirname(file), m[1]));
}

/**
 * A page's headings: its own, plus those of relatively-imported md files (wrapper
 * pages render repo docs as their body). Each source file gets a fresh slugger,
 * matching rehype-slug's per-compiled-module deduplication.
 */
function pageHeadings(file: string, source: string): DocHeading[] {
  const own = extractHeadings(source);
  const imported = importTargets(file, source)
    .filter((target) => existsSync(target))
    .flatMap((target) => extractHeadings(readFileSync(target, 'utf8'), { stripLeadingH1: true }));
  return [...own, ...imported];
}

export function docsFrontmatter(): Plugin {
  let contentDir: string;

  const buildIndex = () => {
    const targets = new Set<string>();
    const entries = collectPages(contentDir).map((file) => {
      const source = readFileSync(file, 'utf8');
      for (const target of importTargets(file, source)) targets.add(target);
      const key = `/src/content/docs/${path.relative(contentDir, file).replaceAll(path.sep, '/')}`;
      const entry: DocPageEntry = { frontmatter: parseFrontmatter(source), headings: pageHeadings(file, source) };
      return [key, entry] as const;
    });
    return { index: Object.fromEntries(entries), targets };
  };

  return {
    name: 'docs-frontmatter',
    configResolved(config) {
      contentDir = path.resolve(config.root, 'src/content/docs');
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return;
      return `export const docsIndex = ${JSON.stringify(buildIndex().index)};`;
    },
    // Dev: re-emit the index when a page or an imported repo doc changes the index
    // (frontmatter or headings). Body-only edits are left to normal per-module HMR.
    configureServer(server) {
      const initial = buildIndex();
      let index = JSON.stringify(initial.index);
      // Imported repo docs live outside the frontend root, make sure they're watched.
      for (const target of initial.targets) server.watcher.add(target);

      const maybeInvalidate = (file: string) => {
        const isPage = file.startsWith(contentDir) && /\.(md|mdx)$/.test(file);
        const isImportTarget = initial.targets.has(file);
        if (!isPage && !isImportTarget) return;
        const next = buildIndex();
        for (const target of next.targets) {
          if (!initial.targets.has(target)) {
            initial.targets.add(target);
            server.watcher.add(target);
          }
        }
        const serialized = JSON.stringify(next.index);
        if (serialized === index) return;
        index = serialized;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', maybeInvalidate);
      server.watcher.on('unlink', maybeInvalidate);
      server.watcher.on('change', maybeInvalidate);
    },
  };
}
