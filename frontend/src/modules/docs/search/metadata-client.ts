import type { QueryClient } from '@tanstack/react-query';
import { operationsQueryOptions } from '~/modules/docs/query';
import { markMatches } from '~/modules/docs/search/highlight';
import type { DocsSearchClient, DocsSearchResult } from '~/modules/docs/search/types';
import { docPages, getDocPage } from '~/modules/page/content';

/**
 * Interim search engine: AND-combined substring matching over docs page
 * metadata (title/description/keywords/headings) and OpenAPI operation
 * summaries. Same contract as the full-text engine that replaces it.
 */

const MAX_CHILD_ROWS = 6;
const MAX_RESULTS = 50;

const matchesAll = (haystack: string, terms: string[]) => terms.every((term) => haystack.includes(term));

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

export function createMetadataClient(queryClient: QueryClient): DocsSearchClient {
  return {
    async search(term) {
      const terms = term.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];

      // Docs pages: grouped blocks (page row + matching heading rows), scored so
      // title matches outrank heading-only matches.
      const pageBlocks: { score: number; rows: DocsSearchResult[] }[] = [];
      for (const page of docPages) {
        if (page.draft || page.hidden) continue;

        const pageHaystack = `${page.name} ${page.description ?? ''} ${page.keywords ?? ''}`.toLowerCase();
        const pageHit = matchesAll(pageHaystack, terms);
        const headingHits = page.headings
          .filter((heading) => heading.depth > 1 && matchesAll(heading.text.toLowerCase(), terms))
          .slice(0, MAX_CHILD_ROWS);
        if (!pageHit && !headingHits.length) continue;

        const link = { to: '/docs/page/$', params: { _splat: page.id } };
        pageBlocks.push({
          score: pageHit ? 2 : 1,
          rows: [
            {
              id: `page:${page.id}`,
              pageId: page.id,
              type: 'page',
              title: markMatches(page.name, terms),
              breadcrumbs: pageBreadcrumbs(page.id),
              ...link,
            },
            ...headingHits.map(
              (heading): DocsSearchResult => ({
                id: `heading:${page.id}#${heading.id}`,
                pageId: page.id,
                type: 'heading',
                title: markMatches(heading.text, terms),
                breadcrumbs: [],
                ...link,
                hash: heading.id,
              }),
            ),
          ],
        });
      }
      pageBlocks.sort((a, b) => b.score - a.score);

      // Operations: flat rows. Offline with a cold cache the fetch fails — degrade
      // to docs-only results rather than failing the whole search.
      const operations = await queryClient.ensureQueryData(operationsQueryOptions).catch(() => null);
      const operationRows: { score: number; row: DocsSearchResult }[] = [];
      for (const op of operations ?? []) {
        const summaryHit = matchesAll(`${op.summary} ${op.id}`.toLowerCase(), terms);
        const restHit = matchesAll(
          `${op.method} ${op.path} ${op.description ?? ''} ${op.tags.join(' ')}`.toLowerCase(),
          terms,
        );
        if (!summaryHit && !restHit) continue;
        operationRows.push({
          score: summaryHit ? 2 : 1,
          row: {
            id: `operation:${op.hash}`,
            pageId: `operation:${op.hash}`,
            type: 'operation',
            title: markMatches(op.summary || op.id, terms),
            breadcrumbs: op.tags,
            to: '/docs/operations',
            hash: op.hash,
            method: op.method,
            deprecated: op.deprecated,
          },
        });
      }
      operationRows.sort((a, b) => b.score - a.score);

      return [...pageBlocks.flatMap((block) => block.rows), ...operationRows.map((entry) => entry.row)].slice(
        0,
        MAX_RESULTS,
      );
    },
  };
}
