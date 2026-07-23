import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CdcRowData } from '../types';

/** Ids the mocked refcount query reports as still referenced by a live host row. */
let referencedIds: string[] = [];
/** Captured soft-delete writes: the set() values and the flattened where-clause params. */
const updates: Array<{ values: Record<string, unknown>; params: unknown[] }> = [];

// Synthetic host/embedded tables: the GC reads columns off whatever `getEntityTable` returns,
// so a fork's real tables are irrelevant to the mechanism under test.
vi.mock('#/tables', async () => {
  const { pgTable, jsonb, text, uuid } = await import('drizzle-orm/pg-core');

  const tasks = pgTable('tasks', {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    items: uuid('items').array().notNull(),
    deletedAt: text('deleted_at'),
    updatedBy: text('updated_by'),
  });
  const items = pgTable('items', {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    deletedAt: text('deleted_at'),
    deletedBy: text('deleted_by'),
    updatedAt: text('updated_at'),
    updatedBy: text('updated_by'),
    stx: jsonb('stx'),
  });

  return { getEntityTable: (type: string) => (type === 'task' ? tasks : items) };
});

// Deep synthetic hierarchy: `item` under project > courseSection > course > organization, so the
// GC's root-channel scope resolution has a non-trivial ancestor chain to walk.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const { deepHierarchy } = await import('shared/testing/deep-fixture');

  return {
    ...actual,
    hierarchy: deepHierarchy,
    isChannel: deepHierarchy.isChannel,
    isProduct: deepHierarchy.isProduct,
    appConfig: {
      ...actual.appConfig,
      entityIdColumnKeys: deepHierarchy.idColumnKeys,
      productEmbeddings: [{ embeddedProduct: 'item', hostProduct: 'task', hostColumn: 'items', lifecycle: 'owned' }],
    },
  };
});

vi.mock('../lib/db', () => {
  const dialect = new PgDialect();

  return {
    cdcDb: {
      selectDistinct: vi.fn(() => ({
        from: () => ({ where: async () => referencedIds.map((id) => ({ id })) }),
      })),
      update: vi.fn(() => ({
        set: (values: Record<string, unknown>) => ({
          where: (condition: SQL) => ({
            returning: async () => {
              updates.push({ values, params: dialect.sqlToQuery(condition).params });
              return [{ id: 'deleted' }];
            },
          }),
        }),
      })),
    },
  };
});

const { gcOwnedEmbeddedRows } = await import('../utils/owned-embedding-gc');

type GcEvents = Parameters<typeof gcOwnedEmbeddedRows>[1];

/** The synthetic products exist only in the mocked hierarchy, so their names need widening here. */
const gc = (hostProduct: string, events: GcEvents) => gcOwnedEmbeddedRows(hostProduct as ProductEntityType, events);

const hostEvent = (rowData: Record<string, unknown>, oldRowData: Record<string, unknown> | null) => ({
  result: { rowData: rowData as CdcRowData, oldRowData: oldRowData as CdcRowData | null },
});

const base = { id: 't1', organizationId: 'o1', updatedBy: 'u1', deletedAt: null, deletedBy: null };

beforeEach(() => {
  referencedIds = [];
  updates.length = 0;
});

describe('gcOwnedEmbeddedRows', () => {
  it('soft-deletes ids that left a host array and no live host still references', async () => {
    await gc('task', [hostEvent({ ...base, items: ['i1'] }, { ...base, items: ['i1', 'i2'] })]);

    expect(updates).toHaveLength(1);
    expect(updates[0].values).toMatchObject({ deletedBy: 'u1', updatedBy: 'u1' });
    expect(updates[0].values.deletedAt).toEqual(expect.any(String));
    // Stripped changedFields keeps the write attributed to the WAL diff
    expect(updates[0].values.stx).toBeDefined();
    expect(updates[0].params).toContain('i2');
    expect(updates[0].params).not.toContain('i1');
  });

  it('spares candidates another live host row still references', async () => {
    referencedIds = ['i2'];
    await gc('task', [hostEvent({ ...base, items: [] }, { ...base, items: ['i2'] })]);

    expect(updates).toHaveLength(0);
  });

  it('surrenders the whole array when the host is soft-deleted', async () => {
    const removedHost = { ...base, items: ['i1', 'i2'], deletedAt: '2026-07-23T00:00:00Z', deletedBy: 'u2' };
    await gc('task', [hostEvent(removedHost, { ...base, items: ['i1', 'i2'] })]);

    expect(updates).toHaveLength(1);
    // The deleting actor is attributed over the updating one
    expect(updates[0].values.deletedBy).toBe('u2');
    expect(updates[0].params).toEqual(expect.arrayContaining(['i1', 'i2']));
  });

  it('groups candidates per root channel', async () => {
    await gc('task', [
      hostEvent({ ...base, items: [] }, { ...base, items: ['i1'] }),
      hostEvent({ ...base, id: 't2', organizationId: 'o2', items: [] }, { ...base, id: 't2', organizationId: 'o2', items: ['i2'] }),
    ]);

    expect(updates).toHaveLength(2);
    expect(updates.flatMap((update) => update.params)).toEqual(expect.arrayContaining(['o1', 'i1', 'o2', 'i2']));
  });

  it('no-ops without an old image, without removals, or for a non-host product', async () => {
    await gc('task', [hostEvent({ ...base, items: ['i1'] }, null)]);
    await gc('task', [hostEvent({ ...base, items: ['i1', 'i2'] }, { ...base, items: ['i1'] })]);
    await gc('item', [hostEvent({ ...base, items: [] }, { ...base, items: ['i1'] })]);

    expect(updates).toHaveLength(0);
  });

  it('skips host rows missing the root channel id', async () => {
    await gc('task', [hostEvent({ ...base, organizationId: null, items: [] }, { ...base, items: ['i1'] })]);

    expect(updates).toHaveLength(0);
  });
});
