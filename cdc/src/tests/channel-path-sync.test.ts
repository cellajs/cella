import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { EntityTableMeta } from '../types';

const upserts: Array<{ params: unknown[] }> = [];

vi.mock('../lib/db', () => ({
  cdcDb: {
    execute: vi.fn(async (query: { queryChunks?: unknown[] }) => {
      // Drizzle sql templates interleave StringChunks ({ value }) with raw param values.
      const params = (query.queryChunks ?? []).filter((c) => !(c && typeof c === 'object' && 'value' in (c as object)));
      upserts.push({ params });
      return { rows: [], rowCount: 1 };
    }),
  },
}));

const { syncChannelPaths } = await import('../utils/channel-path-sync');

// Base cella: 'organization' is the only channel type; 'attachment' is a product.
const event = (
  type: string,
  action: string,
  rowData: Record<string, unknown>,
): { lsn: string; result: ParseMessageResult } => ({
  lsn: '0/1',
  result: {
    activity: { action, entityType: type, organizationId: 'org-1' } as unknown as InsertActivityModel,
    rowData: rowData as ParseMessageResult['rowData'],
    oldRowData: null,
    tableMeta: { kind: 'entity', type, table: {} } as unknown as EntityTableMeta,
  },
});

beforeEach(() => {
  upserts.length = 0;
});

describe('syncChannelPaths', () => {
  it('mirrors channel create/update paths onto counters rows, last write wins per id', async () => {
    await syncChannelPaths([
      event('organization', 'create', { id: 'org-1', path: 'org-1' }),
      event('organization', 'update', { id: 'org-1', path: 'org-1' }),
    ]);
    // Deduped per id: one upsert.
    expect(upserts).toHaveLength(1);
    expect(upserts[0].params).toEqual(['org-1', 'org-1']);
  });

  it('must not leave a channel without its path when the row image carries none', async () => {
    // `path` is a generated column: logical replication leaves it out of the row image.
    await syncChannelPaths([event('organization', 'create', { id: 'org-3', name: 'Org 3' })]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].params).toEqual(['org-3', 'org-3']);
  });

  it('computes the path from the row, whatever path value the image holds', async () => {
    await syncChannelPaths([event('organization', 'update', { id: 'org-4', path: 'other-org/org-4' })]);
    expect(upserts[0].params).toEqual(['org-4', 'org-4']);
  });

  it('ignores products, deletes, and rows without an id', async () => {
    await syncChannelPaths([
      event('attachment', 'create', { id: 'att-1', organizationId: 'org-1' }),
      event('organization', 'delete', { id: 'org-2' }),
      event('organization', 'create', { name: 'No id' }),
    ]);
    expect(upserts).toHaveLength(0);
  });
});
