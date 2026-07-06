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
  updatedAt: z.string().optional(),
});

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
  updatedAt?: string;
  depth: number;
};

const metaModules = import.meta.glob('/src/content/docs/**/*.{md,mdx}', { import: 'frontmatter', eager: true });
const componentModules = import.meta.glob<ComponentType>('/src/content/docs/**/*.{md,mdx}', { import: 'default' });

/** File path → slug (`architecture/index.md` → `architecture`). */
function pathToSlug(path: string): string {
  const slug = path
    .slice(CONTENT_ROOT.length)
    .replace(/\.(md|mdx)$/, '')
    .replace(/(^|\/)index$/, '');
  return slug.replace(/\/$/, '');
}

function buildIndex(): { pages: DocPage[]; loaders: Map<string, () => Promise<ComponentType>> } {
  const slugs = new Set<string>();
  const parsed: { slug: string; path: string; meta: z.infer<typeof frontmatterSchema> }[] = [];

  for (const [path, frontmatter] of Object.entries(metaModules)) {
    const slug = pathToSlug(path);
    if (!slug) throw new Error(`Docs content: a root index file is not supported (${path}); use a named file.`);
    if (slugs.has(slug)) throw new Error(`Docs content: duplicate slug "${slug}" (${path}).`);
    const result = frontmatterSchema.safeParse(frontmatter);
    if (!result.success) throw new Error(`Docs content: invalid frontmatter in ${path}: ${result.error.message}`);
    slugs.add(slug);
    parsed.push({ slug, path, meta: result.data });
  }

  const pages: DocPage[] = parsed.map(({ slug, meta }) => {
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
      updatedAt: meta.updatedAt,
      depth: slug.split('/').length - 1,
    };
  });
  pages.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  const loaders = new Map<string, () => Promise<ComponentType>>();
  for (const [path, loader] of Object.entries(componentModules)) loaders.set(pathToSlug(path), loader);

  return { pages, loaders };
}

const { pages, loaders } = buildIndex();

/** All docs pages, sorted by display order. Includes drafts (callers filter). */
export const docPages: DocPage[] = pages;

export function getDocPage(slug: string): DocPage | undefined {
  return docPages.find((page) => page.id === slug);
}

/** Published (non-draft) child pages of the given page, in display order. */
export function getChildDocPages(slug: string): DocPage[] {
  return docPages.filter((page) => page.parentId === slug && !page.draft);
}

/** Lazy loader for a page's compiled MDX component; undefined for unknown slugs. */
export function getDocPageLoader(slug: string): (() => Promise<ComponentType>) | undefined {
  return loaders.get(slug);
}
