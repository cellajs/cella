import { docsIndex as docsFrontmatter } from 'virtual:docs-frontmatter';
import { type ComponentType, lazy } from 'react';
import { z } from 'zod';
import { spyPrefix } from '~/hooks/use-scroll-spy-store';

const contentRoot = '/src/content/docs/';

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

const docsTileSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  /** Internal path (/docs/...) or absolute http(s) URL. */
  to: z.string().min(1),
});

const docsSectionIds = ['apiReference', 'pages', 'links'] as const;
export type DocsSectionId = (typeof docsSectionIds)[number];

const docsSectionSchema = z.object({ id: z.enum(docsSectionIds), label: z.string().min(1), visible: z.boolean().default(true) });

/** Global docs config, authored as the content root `index.mdx` frontmatter; tiles and sections render in array order. */
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

// Fallback for a content root without an index.mdx: warn and keep docs rendering with default section labels.
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

/** Field names (`id`, `parentId`, `name`, `displayOrder`) match the page entity shape the sidebar and tree helpers expect. */
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

/**
 * Spy section of the page itself: the article wraps every heading, so it is current until the first heading takes over.
 * Heading slugs never contain a slash, so it can't clash with one (pages do have an `## Overview` heading).
 */
export const pageSectionId = 'page/intro';

// Frontmatter and headings come from a build-time index (vite/docs-frontmatter.ts); importing page modules for it would pull every page body into this chunk.
const metaModules = docsFrontmatter;
const componentModules = import.meta.glob<ComponentType>('/src/content/docs/**/*.{md,mdx}', { import: 'default' });

/** File path to slug: `architecture/index.md` becomes `architecture`. */
export function pathToSlug(path: string): string {
  const slug = path
    .slice(contentRoot.length)
    .replace(/\.(md|mdx)$/, '')
    .replace(/(^|\/)index$/, '');
  return slug.replace(/\/$/, '');
}

function buildIndex(): { pages: DocPage[]; loaders: Map<string, () => Promise<ComponentType>>; config: DocsConfig } {
  const slugs = new Set<string>();
  const parsed: { slug: string; path: string; meta: z.infer<typeof frontmatterSchema>; headings: DocHeading[] }[] = [];
  let config: DocsConfig | null = null;

  for (const [path, entry] of Object.entries(metaModules)) {
    const slug = pathToSlug(path);
    if (!slug) {
      // Root index holds the global docs config and the /docs landing body.
      const result = docsConfigSchema.safeParse(entry.frontmatter);
      if (!result.success) throw new Error(`Docs content: invalid docs config in ${path}: ${result.error.message}`);
      config = result.data;
      continue;
    }
    if (slugs.has(slug)) throw new Error(`Docs content: duplicate slug "${slug}" (${path}).`);
    const result = frontmatterSchema.safeParse(entry.frontmatter);
    if (!result.success) throw new Error(`Docs content: invalid frontmatter in ${path}: ${result.error.message}`);
    slugs.add(slug);
    const headings = entry.headings.map((h) => ({ ...h, id: h.id.replace(spyPrefix, '') }));
    parsed.push({ slug, path, meta: result.data, headings });
  }

  const pages: DocPage[] = parsed.map(({ slug, meta, headings }) => {
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

export const docsConfig: DocsConfig = config;

/** All docs pages, sorted by display order, drafts and hidden pages included. */
export const docPages: DocPage[] = pages;

/** The pages the sidebar, the search and the child page lists show: no drafts, no hidden pages. */
export const visibleDocPages = docPages.filter((page) => !page.draft && !page.hidden);

export function getDocPage(slug: string): DocPage | undefined {
  return docPages.find((page) => page.id === slug);
}

export function getChildDocPages(slug: string): DocPage[] {
  return visibleDocPages.filter((page) => page.parentId === slug);
}

// Resolved ahead of render (docs route loader) so the body renders synchronously: a fresh Suspense boundary commits its fallback for a frame even on a cached chunk.
const resolvedComponents = new Map<string, ComponentType>();
const lazyComponents = new Map<string, ComponentType>();

export async function ensureDocPageComponent(slug: string): Promise<ComponentType | undefined> {
  const cached = resolvedComponents.get(slug);
  if (cached) return cached;
  const loader = loaders.get(slug);
  if (!loader) return undefined;
  const component = await loader();
  resolvedComponents.set(slug, component);
  return component;
}

/** The page body: the one a docs route loader resolved, else a lazy import kept per slug so its identity holds across renders. */
export function getDocPageComponent(slug: string): ComponentType | null {
  const component = lazyComponents.get(slug) ?? resolvedComponents.get(slug);
  if (component) return component;
  const loader = loaders.get(slug);
  if (!loader) return null;
  const lazyComponent = lazy(async () => ({ default: await loader() }));
  lazyComponents.set(slug, lazyComponent);
  return lazyComponent;
}
