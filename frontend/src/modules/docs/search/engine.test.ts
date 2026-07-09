import { describe, expect, it } from 'vitest';
import type { GenOperationSummary } from '~/modules/docs/types';
import { createEngine, type EnginePage } from './engine';

/**
 * Pins the engine's search behavior: BM25 ordering with title boost, typo
 * tolerance, the explicit threshold=0 (multi-word queries must match every
 * term) and the page-row + child-row group shape the dialog renders.
 */

const pages: EnginePage[] = [
  {
    slug: 'architecture',
    title: 'Architecture',
    description: 'How the system fits together',
    breadcrumbs: [],
    headings: [
      { id: 'modules', text: 'Modules' },
      { id: 'data-flow', text: 'Data flow' },
    ],
    sections: [
      { headingId: 'modules', text: 'Each module owns its routes, queries and components.' },
      { headingId: 'data-flow', text: 'Queries hydrate from the persister before the network answers.' },
    ],
  },
  {
    slug: 'guides/testing',
    title: 'Testing',
    description: 'Testing guide',
    breadcrumbs: ['Guides'],
    headings: [{ id: 'running-tests', text: 'Running tests' }],
    sections: [{ headingId: 'running-tests', text: 'Run the vitest suite before committing changes.' }],
  },
];

const operations: GenOperationSummary[] = [
  {
    id: 'createOrganization',
    hash: 'organizations-create',
    method: 'post',
    path: '/organizations',
    tags: ['organizations'],
    summary: 'Create organization',
    description: 'Creates a new organization.',
    deprecated: false,
    hasParams: false,
    hasRequestBody: true,
    hasResponseBody: true,
    hasExample: false,
    extensions: {},
    tagsByKind: {},
  },
];

describe('docs search engine', () => {
  const engine = createEngine(pages, operations);

  it('finds a page by title and puts the page row first', async () => {
    const rows = await engine.search('architecture');
    expect(rows[0]).toMatchObject({
      type: 'page',
      pageId: 'architecture',
      to: '/docs/page/$',
      params: { _splat: 'architecture' },
    });
    expect(rows[0].title).toContain('<mark>');
  });

  it('finds body text and anchors the row to its heading', async () => {
    const rows = await engine.search('persister');
    const textRow = rows.find((row) => row.type === 'text');
    expect(textRow).toMatchObject({ pageId: 'architecture', hash: 'data-flow' });
    expect(textRow?.title).toContain('<mark>persister</mark>');
    // The parent page row precedes its child rows even though only body text matched.
    expect(rows.findIndex((row) => row.id === 'page:architecture')).toBeLessThan(rows.indexOf(textRow ?? rows[0]));
  });

  it('tolerates a one-letter typo', async () => {
    const rows = await engine.search('architecure');
    expect(rows.some((row) => row.pageId === 'architecture')).toBe(true);
  });

  it('requires every term of a multi-word query (threshold 0)', async () => {
    expect((await engine.search('running tests')).some((row) => row.pageId === 'guides/testing')).toBe(true);
    expect(await engine.search('running nonexistentterm')).toEqual([]);
  });

  it('finds operations by summary and by method/path, as standalone rows', async () => {
    for (const term of ['create organization', 'post organizations']) {
      const rows = await engine.search(term);
      const opRow = rows.find((row) => row.type === 'operation');
      expect(opRow, `term: ${term}`).toMatchObject({
        to: '/docs/operations',
        hash: 'organizations-create',
        method: 'post',
        breadcrumbs: ['organizations'],
      });
    }
  });

  it('supports adding operations after construction (offline cold-cache recovery)', async () => {
    const docsOnly = createEngine(pages, null);
    expect(await docsOnly.search('create organization')).toEqual([]);
    docsOnly.addOperations(operations);
    expect((await docsOnly.search('create organization')).some((row) => row.type === 'operation')).toBe(true);
  });

  it('returns nothing for a blank query', async () => {
    expect(await engine.search('   ')).toEqual([]);
  });
});
