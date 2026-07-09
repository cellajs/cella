import { create, insertMultiple, search } from '@orama/orama';
import { markMatches, trimAroundMatch } from '~/modules/docs/search/highlight';
import type { DocsSearchResult, DocsSearchResultType } from '~/modules/docs/search/types';
import type { GenOperationSummary } from '~/modules/docs/types';

/**
 * Orama full-text engine, built in the browser on first search. Shipping raw
 * documents and indexing client-side beats a prebuilt `save()` dump: the
 * serialized index is ~5x larger on the wire while `insertMultiple` costs only
 * tens of milliseconds at this corpus size (.todos/DOCS_SEARCH_RESEARCH.md).
 *
 * Pure module: corpus assembly (virtual sections module, query cache) lives in
 * client.ts, so tests can drive this engine with plain fixtures.
 */

/** Everything the engine indexes for one docs page. */
export type EnginePage = {
  slug: string;
  title: string;
  description?: string;
  keywords?: string;
  breadcrumbs: string[];
  headings: { id: string; text: string }[];
  sections: { headingId: string | null; text: string }[];
};

/** Indexed fields; display-only fields ride along on the documents unindexed. */
const searchSchema = {
  kind: 'enum',
  pageId: 'string',
  title: 'string',
  content: 'string',
  path: 'string',
  tags: 'enum[]',
} as const;

type SearchDoc = {
  id: string;
  kind: DocsSearchResultType;
  pageId: string;
  title: string;
  content: string;
  path: string;
  tags: string[];
  // Unindexed display fields
  breadcrumbs: string[];
  to: string;
  params?: { _splat: string };
  hash?: string;
  method?: string;
  deprecated?: boolean;
};

const MAX_HITS = 60;
const MAX_CHILD_ROWS = 5;

function pageDocs(page: EnginePage): SearchDoc[] {
  const base = {
    pageId: page.slug,
    path: '',
    tags: [],
    breadcrumbs: [] as string[],
    to: '/docs/page/$',
    params: { _splat: page.slug },
  };
  return [
    {
      ...base,
      id: `page:${page.slug}`,
      kind: 'page',
      title: page.title,
      content: `${page.description ?? ''} ${page.keywords ?? ''}`.trim(),
      breadcrumbs: page.breadcrumbs,
    },
    ...page.headings.map(
      (heading): SearchDoc => ({
        ...base,
        id: `heading:${page.slug}#${heading.id}`,
        kind: 'heading',
        title: heading.text,
        content: '',
        hash: heading.id,
      }),
    ),
    ...page.sections.map(
      (section, index): SearchDoc => ({
        ...base,
        id: `text:${page.slug}#${section.headingId ?? ''}:${index}`,
        kind: 'text',
        title: '',
        content: section.text,
        hash: section.headingId ?? undefined,
      }),
    ),
  ];
}

function operationDoc(op: GenOperationSummary): SearchDoc {
  return {
    id: `operation:${op.hash}`,
    kind: 'operation',
    pageId: `operation:${op.hash}`,
    title: op.summary || op.id,
    content: op.description ?? '',
    path: `${op.method} ${op.path}`,
    tags: op.tags,
    breadcrumbs: op.tags,
    to: '/docs/operations',
    hash: op.hash,
    method: op.method,
    deprecated: op.deprecated,
  };
}

/**
 * Build a search client over the given corpus. Pure — no data fetching — so
 * tests can drive it with fixtures. `addOperations` supports late arrival of
 * the operations corpus (offline with a cold query cache).
 */
export function createEngine(pages: EnginePage[], operations: GenOperationSummary[] | null) {
  const db = create({ schema: searchSchema });
  const docsById = new Map<string, SearchDoc>();

  const insert = (docs: SearchDoc[]) => {
    for (const doc of docs) docsById.set(doc.id, doc);
    // biome-ignore lint/suspicious/noExplicitAny: Orama's insert generics reject unindexed ride-along fields; runtime stores them fine.
    insertMultiple(db, docs as any[]);
  };

  insert(pages.flatMap(pageDocs));
  if (operations) insert(operations.map(operationDoc));

  const toRow = (doc: SearchDoc, terms: string[]): DocsSearchResult => ({
    id: doc.id,
    pageId: doc.pageId,
    type: doc.kind,
    title:
      doc.kind === 'text' ? markMatches(trimAroundMatch(doc.content, terms), terms) : markMatches(doc.title, terms),
    breadcrumbs: doc.breadcrumbs,
    to: doc.to,
    params: doc.params,
    hash: doc.hash,
    method: doc.method,
    deprecated: doc.deprecated,
  });

  return {
    addOperations(operations: GenOperationSummary[]) {
      insert(operations.map(operationDoc));
    },

    async search(term: string): Promise<DocsSearchResult[]> {
      const terms = term.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];

      const found = await search(db, {
        term,
        properties: ['title', 'content', 'path'],
        tolerance: 1,
        // 0 = documents must match every term; typo tolerance still applies per term.
        threshold: 0,
        boost: { title: 2, path: 1.5 },
        limit: MAX_HITS,
      });

      // Group hits by page, preserving global score order for both group order
      // (a group ranks by its best hit) and the child rows inside each group.
      const groupOrder: string[] = [];
      const grouped = new Map<string, SearchDoc[]>();
      for (const hit of found.hits) {
        const doc = docsById.get(String(hit.id));
        if (!doc) continue;
        if (!grouped.has(doc.pageId)) {
          grouped.set(doc.pageId, []);
          groupOrder.push(doc.pageId);
        }
        grouped.get(doc.pageId)?.push(doc);
      }

      const rows: DocsSearchResult[] = [];
      for (const pageId of groupOrder) {
        const docs = grouped.get(pageId) ?? [];
        // Standalone rows (operations): no parent/child structure.
        if (pageId.startsWith('operation:')) {
          rows.push(...docs.map((doc) => toRow(doc, terms)));
          continue;
        }
        // Page groups: parent page row first (even when only sections matched),
        // then the matching heading/text rows hanging under it.
        const pageDoc = docsById.get(`page:${pageId}`);
        if (pageDoc) rows.push(toRow(pageDoc, terms));
        rows.push(
          ...docs
            .filter((doc) => doc.kind !== 'page')
            .slice(0, MAX_CHILD_ROWS)
            .map((doc) => toRow(doc, terms)),
        );
      }
      return rows;
    },
  };
}
