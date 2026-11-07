import { components, create, insertMultiple, search, type Tokenizer } from '@orama/orama';
import type { GenComponentSchema, GenOperationSummary } from 'sdk/docs-types';
import { parseTerms, trimAroundMatch } from 'shared/utils/text-match';
import { operationLinkOptions, schemaLinkOptions } from '~/modules/docs/helpers/reference-links';
import type { DocsSearchResult, DocsSearchResultType, DocsSearchScope } from '~/modules/docs/search/types';

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
const searchSchema = { kind: 'enum', pageId: 'string', title: 'string', content: 'string', path: 'string', tags: 'enum[]' } as const;

type SearchDoc = Omit<DocsSearchResult, 'type'> & { kind: DocsSearchResultType; content: string; path: string; tags: string[] };

const maxHits = 60;
const maxChildRows = 5;

/**
 * Orama's English splitter keeps `-` inside a word and matches word prefixes, so "tenancy" missed "multi-tenancy".
 * Only the parts are kept: with the whole word as well, "multi" matches two words of one page, and the all-terms
 * check, which counts matched words, drops the page for the query "multi-tenancy".
 */
function createHyphenSplittingTokenizer(): Tokenizer {
  const base = components.tokenizer.createTokenizer();
  return {
    ...base,
    tokenize: (raw, language, prop, withCache) => {
      const tokens = base.tokenize(raw, language, prop, withCache);
      if (!tokens.some((token) => token.includes('-'))) return tokens;
      return [...new Set(tokens.flatMap((token) => token.split('-')).filter(Boolean))];
    },
  };
}

function pageDocs(page: EnginePage): SearchDoc[] {
  const base = { pageId: page.slug, path: '', tags: [], breadcrumbs: [], to: '/docs/page/$', params: { _splat: page.slug } };
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

/** Tier-1 breadcrumb labels: bare tag names ("base") are ambiguous on their own. */
type EngineLabels = { operations: string; schemas: string };
const defaultLabels: EngineLabels = { operations: 'operations', schemas: 'schemas' };

const operationDoc = (op: GenOperationSummary, labels: EngineLabels): SearchDoc => ({
  id: `operation:${op.hash}`,
  kind: 'operation',
  pageId: `operation:${op.hash}`,
  title: op.summary || op.id,
  content: op.description,
  path: `${op.method} ${op.path}`,
  tags: op.tags,
  breadcrumbs: [labels.operations, ...op.tags],
  ...operationLinkOptions(op),
  method: op.method,
  deprecated: op.deprecated,
});

const schemaDoc = (schema: GenComponentSchema, labels: EngineLabels): SearchDoc => ({
  id: `schema:${schema.name}`,
  kind: 'schema',
  pageId: `schema:${schema.name}`,
  title: schema.name,
  content: schema.description ?? '',
  path: '',
  tags: [schema.schemaTag],
  breadcrumbs: [labels.schemas, schema.schemaTag],
  ...schemaLinkOptions(schema),
});

/** Scope chip → the document kinds it allows. */
const scopeKinds: Record<Exclude<DocsSearchScope, 'all'>, DocsSearchResultType[]> = {
  pages: ['page', 'heading', 'text'],
  api: ['operation', 'schema'],
};

/** `addOperations`/`addSchemas` accept the API corpus late, as when offline with a cold query cache. */
export function createEngine(
  pages: EnginePage[],
  operations: GenOperationSummary[] | null,
  schemas: GenComponentSchema[] | null = null,
  labels: EngineLabels = defaultLabels,
) {
  const db = create({ schema: searchSchema, components: { tokenizer: createHyphenSplittingTokenizer() } });
  const docsById = new Map<string, SearchDoc>();

  const insert = (docs: SearchDoc[]) => {
    for (const doc of docs) docsById.set(doc.id, doc);
    // biome-ignore lint/suspicious/noExplicitAny: Orama's insert generics reject unindexed ride-along fields; runtime stores them fine.
    insertMultiple(db, docs as any[]);
  };

  insert(pages.flatMap(pageDocs));
  if (operations) insert(operations.map((op) => operationDoc(op, labels)));
  if (schemas) insert(schemas.map((schema) => schemaDoc(schema, labels)));

  const toRow = ({ kind, title, content, path, tags, ...row }: SearchDoc, terms: string[]): DocsSearchResult => ({
    ...row,
    type: kind,
    title: kind === 'text' ? trimAroundMatch(content, terms) : title,
  });

  return {
    addOperations: (operations: GenOperationSummary[]) => insert(operations.map((op) => operationDoc(op, labels))),
    addSchemas: (schemas: GenComponentSchema[]) => insert(schemas.map((schema) => schemaDoc(schema, labels))),

    async search(term: string, scope: DocsSearchScope = 'all'): Promise<DocsSearchResult[]> {
      const terms = parseTerms(term);
      if (!terms.length) return [];

      const found = await search(db, {
        term,
        properties: ['title', 'content', 'path'],
        tolerance: 1,
        // 0 = documents must match every term; typo tolerance still applies per term.
        threshold: 0,
        boost: { title: 2, path: 1.5 },
        limit: maxHits,
        ...(scope !== 'all' && { where: { kind: { in: scopeKinds[scope] } } }),
      });

      // Group hits by page, preserving global score order; a group ranks by its best hit
      const grouped = new Map<string, SearchDoc[]>();
      for (const hit of found.hits) {
        const doc = docsById.get(String(hit.id));
        if (!doc) continue;
        const group = grouped.get(doc.pageId);
        if (group) group.push(doc);
        else grouped.set(doc.pageId, [doc]);
      }

      const rows: DocsSearchResult[] = [];
      for (const [pageId, docs] of grouped) {
        // Standalone rows (operations, schemas): no parent/child structure.
        if (pageId.startsWith('operation:') || pageId.startsWith('schema:')) {
          rows.push(...docs.map((doc) => toRow(doc, terms)));
          continue;
        }
        // Page groups: parent page row first, even when only sections matched, then its heading/text rows
        const pageDoc = docsById.get(`page:${pageId}`);
        if (pageDoc) rows.push(toRow(pageDoc, terms));
        rows.push(
          ...docs
            .filter((doc) => doc.kind !== 'page')
            .slice(0, maxChildRows)
            .map((doc) => toRow(doc, terms)),
        );
      }
      return rows;
    },
  };
}
