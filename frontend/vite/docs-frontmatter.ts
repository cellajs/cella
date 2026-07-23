import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import GithubSlugger from 'github-slugger';
import type { Plugin } from 'vite';
import { parse } from 'yaml';
import { createUpdatedAtResolver, type UpdatedAtResolver } from './git-updated-at';

const VIRTUAL_ID = 'virtual:docs-frontmatter';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** Lazy virtual module of page paragraphs keyed to their nearest heading for docs search. */
const SECTIONS_VIRTUAL_ID = 'virtual:docs-search-sections';
const SECTIONS_RESOLVED_ID = `\0${SECTIONS_VIRTUAL_ID}`;

/** Per-paragraph cap: keeps the search corpus bounded on prose-heavy pages. */
const MAX_SECTION_LENGTH = 500;

/** Matches the rehype-slug prefix configured in vite.config.ts. */
const ID_PREFIX = 'spy-';

const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/;
const FENCED_CODE_BLOCK = /^(```|~~~).*?^\1.*?$/gms;
/** Relative md imports in .mdx wrappers (e.g. `import Content from '../../cella/TESTING.md'`). */
const RELATIVE_MD_IMPORT = /^import\s[^\n]*?from\s+['"](\.[^'"]+\.md)['"]/gm;

export type DocHeading = { id: string; text: string; depth: number };
export type DocPageEntry = { frontmatter: unknown; headings: DocHeading[] };
/** A plaintext body paragraph anchored to its nearest heading (null = intro before the first). */
export type DocSection = { headingId: string | null; text: string };

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
 * Body markdown → the plain text a reader sees: mdx imports/exports, JSX/HTML
 * tags, comments and markdown syntax drop away; links/images reduce to labels.
 */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, ' ') // html comments
    .replace(/^(import|export)\s.+$/gm, '') // mdx module lines
    .replace(/<\/?[A-Za-z][^>\n]*>/g, ' ') // jsx/html tags
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images → label
    .replace(/`([^`]*)`/g, '$1') // inline code -> content
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // strong -> content
    .replace(/(\*|\b_)(.*?)\1/g, '$2') // emphasis -> content
    .replace(/^[ \t]*([-*+]|\d+\.)[ \t]+/gm, '') // list markers
    .replace(/^[ \t]*>[ \t]?/gm, '') // blockquote markers
    .replace(/^[ \t]*[-:|\s]+$/gm, '') // table separator rows
    .replace(/\|/g, ' ') // table cell pipes
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADING_LINE_SINGLE = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

/** Lookahead for a list-item start: each bullet indexes as its own section. */
const LIST_ITEM_BOUNDARY = /\n(?=[ \t]*(?:[-*+]|\d+\.)[ \t])/;

/**
 * Extract headings and sections with one slugger so anchors and duplicate suffixes agree.
 * Optionally strip the repository document H1 to match rendering.
 */
export function extractStructure(
  source: string,
  { stripLeadingH1 = false } = {},
): { headings: DocHeading[]; sections: DocSection[] } {
  const body = source.replace(FRONTMATTER_BLOCK, '').replace(FENCED_CODE_BLOCK, '');
  const slugger = new GithubSlugger();
  const headings: DocHeading[] = [];
  const sections: DocSection[] = [];
  let currentHeadingId: string | null = null;
  let buffer: string[] = [];
  let firstHeading = true;

  const flush = () => {
    // Paragraph-level sections: split on blank lines before whitespace collapses, then at
    // list-item starts so an uninterrupted list never collapses into one capped section.
    for (const paragraph of buffer.join('\n').split(/\n[ \t]*\n+/)) {
      for (const block of paragraph.split(LIST_ITEM_BOUNDARY)) {
        const text = toPlainText(block);
        if (text) sections.push({ headingId: currentHeadingId, text: text.slice(0, MAX_SECTION_LENGTH) });
      }
    }
    buffer = [];
  };

  for (const line of body.split(/\r?\n/)) {
    const match = HEADING_LINE_SINGLE.exec(line);
    if (!match) {
      buffer.push(line);
      continue;
    }
    flush();
    const depth = match[1].length;
    const skip = stripLeadingH1 && firstHeading && depth === 1;
    firstHeading = false;
    if (skip) {
      currentHeadingId = null;
      continue;
    }
    const text = toTextContent(match[2]);
    const id = ID_PREFIX + slugger.slug(text);
    headings.push({ id, text, depth });
    currentHeadingId = id;
  }
  flush();

  return { headings, sections };
}

/**
 * Extract headings from markdown source with the same ids rehype-slug assigns.
 * Exported for the slug-agreement unit test.
 */
export function extractHeadings(source: string, opts: { stripLeadingH1?: boolean } = {}): DocHeading[] {
  return extractStructure(source, opts).headings;
}

function parseFrontmatter(source: string): unknown {
  const match = FRONTMATTER_BLOCK.exec(source);
  return match ? parse(match[1]) : {};
}

/** Derive unpinned page `updatedAt` from the newest Git date across its imported documents. */
function withUpdatedAt(frontmatter: unknown, files: string[], resolver: UpdatedAtResolver): unknown {
  const record = frontmatter && typeof frontmatter === 'object' ? (frontmatter as Record<string, unknown>) : {};
  const pinned = typeof record.updatedAt === 'string' ? record.updatedAt : undefined;
  const updatedAt = resolver.resolve(files, pinned);
  return updatedAt ? { ...record, updatedAt } : frontmatter;
}

/** Relative .md import targets of an .mdx wrapper, resolved to absolute paths. */
function importTargets(file: string, source: string): string[] {
  if (!file.endsWith('.mdx')) return [];
  return [...source.matchAll(RELATIVE_MD_IMPORT)].map((m) => path.resolve(path.dirname(file), m[1]));
}

/** Collect page and imported-document sections with per-module slugger scopes matching rehype. */
export function pageStructure(file: string, source: string): { headings: DocHeading[]; sections: DocSection[] } {
  const own = extractStructure(source);
  const imported = importTargets(file, source)
    .filter((target) => existsSync(target))
    .map((target) => extractStructure(readFileSync(target, 'utf8'), { stripLeadingH1: true }));
  return {
    headings: [...own.headings, ...imported.flatMap((s) => s.headings)],
    sections: [...own.sections, ...imported.flatMap((s) => s.sections)],
  };
}

/** Exposes page metadata and search text as virtual modules without importing page components. */
export function docsFrontmatter(): Plugin {
  let contentDir: string;
  let resolver: UpdatedAtResolver | undefined;

  const buildIndex = () => {
    const targets = new Set<string>();
    const entries: (readonly [string, DocPageEntry])[] = [];
    const sectionEntries: (readonly [string, DocSection[]])[] = [];

    for (const file of collectPages(contentDir)) {
      const source = readFileSync(file, 'utf8');
      const imports = importTargets(file, source);
      for (const target of imports) targets.add(target);
      const relative = path.relative(contentDir, file).replaceAll(path.sep, '/');
      const key = `/src/content/docs/${relative}`;
      // updatedAt tracks the page plus its imported repo docs (wrapper pages render a
      // repo doc as their body): a body edit in cella/SYNC_ENGINE.md bumps the page.
      const parsed = parseFrontmatter(source);
      const frontmatter = resolver ? withUpdatedAt(parsed, [file, ...imports], resolver) : parsed;
      const { headings, sections } = pageStructure(file, source);
      entries.push([key, { frontmatter, headings }] as const);

      // Search corpus: skip the root index (docs config, landing body) and pages
      // excluded from navigation. Hidden and draft pages must not surface in search.
      const { draft, hidden } = (frontmatter ?? {}) as { draft?: boolean; hidden?: boolean };
      if (/^index\.mdx?$/.test(relative) || draft || hidden) continue;
      // Bare anchor ids: consumers navigate via hashes, which drop the DOM prefix.
      sectionEntries.push([
        key,
        sections.map((s) => ({ ...s, headingId: s.headingId ? s.headingId.replace(ID_PREFIX, '') : null })),
      ] as const);
    }

    return { index: Object.fromEntries(entries), sections: Object.fromEntries(sectionEntries), targets };
  };

  return {
    name: 'docs-frontmatter',
    configResolved(config) {
      contentDir = path.resolve(config.root, 'src/content/docs');
      resolver = createUpdatedAtResolver(contentDir);
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      if (id === SECTIONS_VIRTUAL_ID) return SECTIONS_RESOLVED_ID;
    },
    load(id) {
      if (id === RESOLVED_ID) return `export const docsIndex = ${JSON.stringify(buildIndex().index)};`;
      if (id === SECTIONS_RESOLVED_ID)
        return `export const docsSectionsIndex = ${JSON.stringify(buildIndex().sections)};`;
    },
    // Dev: re-emit the index when a page or an imported repo doc changes the index
    // (frontmatter or headings). Body-only edits are left to normal per-module HMR.
    configureServer(server) {
      const initial = buildIndex();
      let index = JSON.stringify(initial.index);
      // Imported repo docs live outside the frontend root, make sure they're watched.
      for (const target of initial.targets) server.watcher.add(target);

      // Debounce multi-file reparent bursts so the index never exposes a half-moved tree or duplicate reloads.
      let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

      const rebuild = () => {
        rebuildTimer = null;
        const next = buildIndex();
        for (const target of next.targets) {
          if (!initial.targets.has(target)) {
            initial.targets.add(target);
            server.watcher.add(target);
          }
        }
        // Body edits change the search corpus: invalidate quietly so the next
        // (re)load of the sections module is fresh. Without a reload, the search DB is
        // memoized per session anyway, and body HMR shouldn't hard-refresh dev.
        const sectionsMod = server.moduleGraph.getModuleById(SECTIONS_RESOLVED_ID);
        if (sectionsMod) server.moduleGraph.invalidateModule(sectionsMod);

        const serialized = JSON.stringify(next.index);
        if (serialized === index) return;
        index = serialized;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };

      const maybeInvalidate = (file: string) => {
        const isPage = file.startsWith(contentDir) && /\.(md|mdx)$/.test(file);
        const isImportTarget = initial.targets.has(file);
        if (!isPage && !isImportTarget) return;
        if (rebuildTimer) clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(rebuild, 200);
      };
      server.watcher.on('add', maybeInvalidate);
      server.watcher.on('unlink', maybeInvalidate);
      server.watcher.on('change', maybeInvalidate);
    },
  };
}
