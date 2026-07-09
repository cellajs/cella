import { docsIndex as docsFrontmatter } from 'virtual:docs-frontmatter';
import type { ComponentType } from 'react';
import { z } from 'zod';

/**
 * Docs content collection. Pages are md/mdx files in `src/content/docs`,
 * compiled by @mdx-js/rollup (vite.config.ts). This module builds the typed
 * metadata index that drives the docs sidebar, the pages table and the page
 * view; page bodies stay code-split and load lazily per page.
 *
 * Slug rules: the slug is the file path relative to the content root without
 * extension; `index` files represent their directory (`architecture/index.md`
 * → `architecture`). A page's parent is the index page of its directory.
 */

const CONTENT_ROOT = '/src/content/docs/';

export const docRenderModes = ['default', 'overview', 'nodeOnly'] as const;
export type DocRenderMode = (typeof docRenderModes)[number];

const frontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  order: z.number().default(0),
  renderMode: z.enum(docRenderModes).default('default'),
  keywords: z.string().optional(),
  draft: z.boolean().default(false),
  hidden: z.boolean().default(false),
  updatedAt: z.string().optional(),
});

/**
 * Global docs config, authored as the frontmatter of the content root `index.mdx`.
 * Drives the /docs landing page (title, intro body, tiles) and the docs sidebar
 * sections so forks can customize both without code. Tiles and sections render
 * in array order.
 */
const docsTileSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  /** Internal path (/docs/...) or absolute http(s) URL. */
  to: z.string().min(1),
});

export const docsSectionIds = ['apiReference', 'pages', 'links'] as const;
export type DocsSectionId = (typeof docsSectionIds)[number];

const docsSectionSchema = z.object({
  id: z.enum(docsSectionIds),
  label: z.string().min(1),
  visible: z.boolean().default(true),
});

const docsConfigSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  keywords: z.string().optional(),
  tiles: z.array(docsTileSchema).default([]),
  sections: z
    .array(docsSectionSchema)
    .default([])
    .refine((sections) => new Set(sections.map((s) => s.id)).size === sections.length, 'section ids must be unique'),
});

export type DocsConfig = z.infer<typeof docsConfigSchema>;
export type DocsTile = z.infer<typeof docsTileSchema>;
export type DocsSection = z.infer<typeof docsSectionSchema>;

// Migration cushion for forks that sync code before adding a root index.mdx: warn and
// keep the docs section working with default section labels instead of failing the build.
const defaultDocsConfig: DocsConfig = {
  title: 'Docs',
  description: undefined,
  keywords: undefined,
  tiles: [],
  sections: [
    { id: 'pages', label: 'Documentation', visible: true },
    { id: 'apiReference', label: 'API reference', visible: true },
    { id: 'links', label: 'Links', visible: true },
  ],
};

/** A content heading (h2/h3/...) with its `spy-`-prefixed DOM id stripped to the bare hash slug. */
export type DocHeading = { id: string; text: string; depth: number };

/**
 * A docs page's metadata. Field names (`id`, `parentId`, `name`,
 * `displayOrder`) intentionally mirror the old page entity shape so the tree
 * helpers in the sidebar and table keep working unchanged.
 */
export type DocPage = {
  id: string;
  parentId: string | null;
  name: string;
  description?: string;
  keywords?: string;
  displayOrder: number;
  renderMode: DocRenderMode;
  draft: boolean;
  /** Routable but excluded from the sidebar tree and child-page lists. */
  hidden: boolean;
  updatedAt?: string;
  depth: number;
  headings: DocHeading[];
};

/** DOM id prefix the mdx pipeline (rehype-slug) puts on heading ids; spy store convention. */
const HEADING_ID_PREFIX = 'spy-';

// Frontmatter + headings come from a build-time index (vite/docs-frontmatter.ts) rather
// than an eager glob: eagerly importing page modules for their `frontmatter` export would
// pull every page body into this chunk, defeating the lazy per-page glob below.
const metaModules = docsFrontmatter;
const componentModules = import.meta.glob<ComponentType>('/src/content/docs/**/*.{md,mdx}', { import: 'default' });

/** File path → slug (`architecture/index.md` → `architecture`). */
function pathToSlug(path: string): string {
  const slug = path
    .slice(CONTENT_ROOT.length)
    .replace(/\.(md|mdx)$/, '')
    .replace(/(^|\/)index$/, '');
  return slug.replace(/\/$/, '');
}

function buildIndex(): {
  pages: DocPage[];
  loaders: Map<string, () => Promise<ComponentType>>;
  config: DocsConfig;
} {
  const slugs = new Set<string>();
  const parsed: { slug: string; path: string; meta: z.infer<typeof frontmatterSchema>; headings: DocHeading[] }[] = [];
  let config: DocsConfig | null = null;

  for (const [path, entry] of Object.entries(metaModules)) {
    const slug = pathToSlug(path);
    if (!slug) {
      // Root index: the global docs config + /docs landing body, not a regular page.
      const result = docsConfigSchema.safeParse(entry.frontmatter);
      if (!result.success) throw new Error(`Docs content: invalid docs config in ${path}: ${result.error.message}`);
      config = result.data;
      continue;
    }
    if (slugs.has(slug)) throw new Error(`Docs content: duplicate slug "${slug}" (${path}).`);
    const result = frontmatterSchema.safeParse(entry.frontmatter);
    if (!result.success) throw new Error(`Docs content: invalid frontmatter in ${path}: ${result.error.message}`);
    slugs.add(slug);
    // Bare hash slugs for the spy store: hashes are unprefixed, DOM ids carry the prefix.
    const headings = entry.headings.map((h) => ({ ...h, id: h.id.replace(HEADING_ID_PREFIX, '') }));
    parsed.push({ slug, path, meta: result.data, headings });
  }

  const pages: DocPage[] = parsed.map(({ slug, meta, headings }) => {
    // Parent is the index page of the containing directory, when it exists
    const dir = slug.includes('/') ? slug.slice(0, slug.lastIndexOf('/')) : null;
    const parentId = dir && slugs.has(dir) ? dir : null;
    return {
      id: slug,
      parentId,
      name: meta.title,
      description: meta.description,
      keywords: meta.keywords,
      displayOrder: meta.order,
      renderMode: meta.renderMode,
      draft: meta.draft,
      hidden: meta.hidden,
      updatedAt: meta.updatedAt,
      depth: slug.split('/').length - 1,
      headings,
    };
  });
  pages.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  const loaders = new Map<string, () => Promise<ComponentType>>();
  for (const [path, loader] of Object.entries(componentModules)) loaders.set(pathToSlug(path), loader);

  if (!config) {
    console.warn('Docs content: no root index.mdx found; using the default docs config.');
    config = defaultDocsConfig;
  }

  return { pages, loaders, config };
}

const { pages, loaders, config } = buildIndex();

/** Global docs config (landing page + sidebar sections), from the content root index.mdx. */
export const docsConfig: DocsConfig = config;

/** All docs pages, sorted by display order. Includes drafts (callers filter). */
export const docPages: DocPage[] = pages;

export function getDocPage(slug: string): DocPage | undefined {
  return docPages.find((page) => page.id === slug);
}

/** Published (non-draft, non-hidden) child pages of the given page, in display order. */
export function getChildDocPages(slug: string): DocPage[] {
  return docPages.filter((page) => page.parentId === slug && !page.draft && !page.hidden);
}

/** Lazy loader for a page's compiled MDX component; undefined for unknown slugs. */
export function getDocPageLoader(slug: string): (() => Promise<ComponentType>) | undefined {
  return loaders.get(slug);
}

// Components resolved ahead of render (docs page route loader), so the page view can
// render the body synchronously — a fresh Suspense boundary otherwise commits its
// fallback for at least a frame even when the chunk is already cached.
const resolvedComponents = new Map<string, ComponentType>();

/** Load and memoize a page's compiled MDX component; undefined for unknown slugs. */
export async function ensureDocPageComponent(slug: string): Promise<ComponentType | undefined> {
  const cached = resolvedComponents.get(slug);
  if (cached) return cached;
  const loader = loaders.get(slug);
  if (!loader) return undefined;
  const component = await loader();
  resolvedComponents.set(slug, component);
  return component;
}

/** Synchronous access to a component previously resolved via ensureDocPageComponent. */
export function getResolvedDocPageComponent(slug: string): ComponentType | undefined {
  return resolvedComponents.get(slug);
}
