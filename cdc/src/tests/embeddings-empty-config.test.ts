import type { ProductEntityType } from 'shared';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PendingEvent } from '../types';

/** Members of the mocked database that were read: every query starts by reading one. */
const touched: string[] = [];

// The template's own config, stated here so the file holds in an app that declares embeddings.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  return { ...actual, appConfig: { ...actual.appConfig, productEmbeddings: [] } };
});

vi.mock('../lib/db', () => ({
  cdcDb: new Proxy(
    {},
    {
      get: (_target, member) => {
        touched.push(String(member));
        return () => {
          throw new Error(`cdcDb.${String(member)} was called`);
        };
      },
    },
  ),
}));

const { appConfig } = await import('shared');
const { embeddingsAfterDispatch, isEmbeddingCleanupWrite, suppressEmbeddingPropagation } = await import('../embeddings');
const { cleanupEmbeddingReferences } = await import('../embeddings/embedding-cleanup');
const { gcOwnedEmbeddedRows } = await import('../embeddings/owned-embedding-gc');

const productType: ProductEntityType = appConfig.productEntityTypes[0];

/**
 * A hard delete and a soft delete of one product type: what the hooks act on when an embedding is declared. The cast
 * covers the rest of a change, which nothing reads without one.
 */
const events = [
  { lsn: '0/1', result: { activity: { action: 'delete', entityType: productType, subjectId: 'r1' }, rowData: { id: 'r1' }, oldRowData: null } },
  {
    lsn: '0/2',
    result: {
      activity: { action: 'update', entityType: productType, subjectId: 'r2' },
      rowData: { id: 'r2', deletedAt: '2026-10-01T10:00:00.000Z' },
      oldRowData: { id: 'r2', deletedAt: null },
    },
  },
] as unknown as PendingEvent[];

beforeEach(() => {
  touched.length = 0;
});

it('with no embedding declared, every hook returns at once and without a database call', async () => {
  await embeddingsAfterDispatch(productType, 'delete', events);
  await embeddingsAfterDispatch(productType, 'update', events);

  expect(suppressEmbeddingPropagation(events)).toBe(events);
  expect(isEmbeddingCleanupWrite(productType, ['name'])).toBe(false);
  expect(touched).toEqual([]);
});

it('with no embedding declared, neither the reference cleanup nor the collection of owned rows issues a statement', async () => {
  await cleanupEmbeddingReferences(productType, 'delete', events);
  await cleanupEmbeddingReferences(productType, 'update', events);
  await gcOwnedEmbeddedRows(productType, events);

  expect(touched).toEqual([]);
});
