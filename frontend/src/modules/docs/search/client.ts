import type { QueryClient } from '@tanstack/react-query';
import { operationsQueryOptions } from '~/modules/docs/query';
import type { EnginePage } from '~/modules/docs/search/engine';
import type { DocsSearchClient } from '~/modules/docs/search/types';
import { docPages, getDocPage, pathToSlug } from '~/modules/page/content';

let clientPromise: Promise<DocsSearchClient> | null = null;

/**
 * Lazily create (once per session) the docs search client. The engine (Orama)
 * and the body-text corpus are dynamic imports, so their weight only loads
 * when search is actually used.
 */
export function getDocsSearchClient(queryClient: QueryClient): Promise<DocsSearchClient> {
  clientPromise ??= buildClient(queryClient);
  return clientPromise;
}

/** Ancestor page names, root-first (breadcrumb trail for a page row). */
function pageBreadcrumbs(slug: string): string[] {
  const crumbs: string[] = [];
  let parentId = getDocPage(slug)?.parentId ?? null;
  while (parentId) {
    const parent = getDocPage(parentId);
    if (!parent) break;
    crumbs.unshift(parent.name);
    parentId = parent.parentId;
  }
  return crumbs;
}

/** Assemble the corpus (build-time sections + query-cached operations) and wrap the engine. */
async function buildClient(queryClient: QueryClient): Promise<DocsSearchClient> {
  const [{ createEngine }, { docsSectionsIndex }, operations] = await Promise.all([
    import('~/modules/docs/search/engine'),
    import('virtual:docs-search-sections'),
    // Reads the same cache the API reference uses (staleTime: Infinity, prefetched
    // by the docs route loader). Offline with a cold cache the fetch fails —
    // degrade to docs-only and retry per search.
    queryClient.ensureQueryData(operationsQueryOptions).catch(() => null),
  ]);

  const sectionsBySlug = new Map(Object.entries(docsSectionsIndex).map(([path, s]) => [pathToSlug(path), s]));
  const pages: EnginePage[] = docPages
    .filter((page) => !page.draft && !page.hidden)
    .map((page) => ({
      slug: page.id,
      title: page.name,
      description: page.description,
      keywords: page.keywords,
      breadcrumbs: pageBreadcrumbs(page.id),
      // h1 duplicates the page title; index depth ≥ 2 like the TOC does.
      headings: page.headings.filter((heading) => heading.depth > 1),
      sections: sectionsBySlug.get(page.id) ?? [],
    }));

  const engine = createEngine(pages, operations);
  let hasOperations = operations !== null;

  return {
    async search(term) {
      if (!hasOperations) {
        const late = await queryClient.ensureQueryData(operationsQueryOptions).catch(() => null);
        if (late) {
          engine.addOperations(late);
          hasOperations = true;
        }
      }
      return engine.search(term);
    },
  };
}
