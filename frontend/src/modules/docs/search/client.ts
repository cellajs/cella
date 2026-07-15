import type { QueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { operationsQueryOptions, schemasQueryOptions } from '~/modules/docs/query';
import type { EnginePage } from '~/modules/docs/search/engine';
import type { DocsSearchClient } from '~/modules/docs/search/types';
import { docPages, getDocPage, pathToSlug } from '~/modules/page/content';

let clientPromise: Promise<DocsSearchClient> | null = null;

/**
 * Lazily create the docs search client (once per session). The engine (Orama) and body-text
 * corpus are dynamic imports, so their weight loads only when search is actually used.
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

/** Assemble the corpus (build-time sections + query-cached API docs) and wrap the engine. */
async function buildClient(queryClient: QueryClient): Promise<DocsSearchClient> {
  const [{ createEngine }, { docsSectionsIndex }, operations, schemas] = await Promise.all([
    import('~/modules/docs/search/engine'),
    import('virtual:docs-search-sections'),
    // Reads the same cache the API reference uses (staleTime: Infinity, prefetched by the docs
    // route loader). Offline with a cold cache the fetch fails — degrade to docs-only, retry per search.
    queryClient.ensureQueryData(operationsQueryOptions).catch(() => null),
    queryClient.ensureQueryData(schemasQueryOptions).catch(() => null),
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

  // Tier-1 breadcrumb labels match the sidebar's lowercase section rows.
  const engine = createEngine(pages, operations, schemas, {
    operations: t('c:operation', { count: 2 }).toLowerCase(),
    schemas: t('c:schema', { count: 2 }).toLowerCase(),
  });
  let hasOperations = operations !== null;
  let hasSchemas = schemas !== null;

  return {
    async search(term, scope) {
      if (!hasOperations) {
        const late = await queryClient.ensureQueryData(operationsQueryOptions).catch(() => null);
        if (late) {
          engine.addOperations(late);
          hasOperations = true;
        }
      }
      if (!hasSchemas) {
        const late = await queryClient.ensureQueryData(schemasQueryOptions).catch(() => null);
        if (late) {
          engine.addSchemas(late);
          hasSchemas = true;
        }
      }
      return engine.search(term, scope);
    },
  };
}
