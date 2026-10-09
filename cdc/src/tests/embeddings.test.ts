import { getTableName, type SQL } from 'drizzle-orm';
import { type AnyPgTable, PgDialect } from 'drizzle-orm/pg-core';
import type { Pgoutput } from 'pg-logical-replication';
import type { ActivityAction, ProductEntityType } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { PendingEvent, TableMeta } from '../types';

/** Host updates the mocked database was asked to run: the table, the set() values and the where clause. */
const statements: Array<{ table: AnyPgTable; values: Record<string, SQL>; condition: SQL }> = [];

// A host `task` that holds `item` ids in its `items` column, on synthetic tables.
vi.mock('#/tables', async () => {
  const { pgTable, jsonb, text, uuid } = await import('drizzle-orm/pg-core');

  const tasks = pgTable('tasks', {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    name: text('name'),
    items: uuid('items').array().notNull(),
    stx: jsonb('stx'),
  });
  const items = pgTable('items', {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    deletedAt: text('deleted_at'),
  });

  return { entityTables: { task: tasks, item: items }, resourceTables: {}, getEntityTable: (type: string) => (type === 'task' ? tasks : items) };
});

// The deep fixture has both products, so the embedding below is one any app's test run can resolve.
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
      channelEntityTypes: deepHierarchy.channelTypes,
      entityIdColumnKeys: deepHierarchy.idColumnKeys,
      productEmbeddings: [{ embeddedProduct: 'item', hostProduct: 'task', hostColumn: 'items' }],
    },
  };
});

vi.mock('../lib/db', () => ({
  cdcDb: {
    update: (table: AnyPgTable) => ({
      set: (values: Record<string, SQL>) => ({
        where: async (condition: SQL) => {
          statements.push({ table, values, condition });
        },
      }),
    }),
  },
}));

// The mock replaces the module, so the one export read here is typed by hand.
const { getEntityTable } = (await import('#/tables')) as unknown as { getEntityTable: (type: string) => AnyPgTable };
const { embeddingsAfterDispatch } = await import('../embeddings');
const { cleanupEmbeddingReferences } = await import('../embeddings/embedding-cleanup');
const { handleUpdate } = await import('../handlers/update');
const { createActivity } = await import('../services/create-activity');
const { TransactionBuffer } = await import('../services/transaction-buffer');

type SyntheticProduct = 'task' | 'item';
type Row = Record<string, unknown> & { id: string };

/** The synthetic products are no product of the app, so their names are widened where the worker asks for one. */
const productOf = (type: SyntheticProduct) => type as ProductEntityType;

/** A registry entry of a synthetic table: its kind, type and drizzle table. The cast covers the column map, which these paths read as absent. */
const metaOf = (type: SyntheticProduct) => ({ kind: 'entity', type, table: getEntityTable(type) }) as unknown as TableMeta;

const ancestors = { organizationId: 'o1', courseId: 'c1', courseSectionId: 's1', projectId: 'p1' };
const taskRow = (id: string, values: Record<string, unknown> = {}): Row => ({ id, ...ancestors, name: 'Task', items: [], ...values });
const itemRow = (id: string, values: Record<string, unknown> = {}): Row => ({ id, ...ancestors, deletedAt: null, ...values });

/** A parsed change of a synthetic row, with the activity the worker builds for it. */
function change(
  type: SyntheticProduct,
  action: ActivityAction,
  rowData: Row,
  { changedFields = null, oldRowData = null }: { changedFields?: string[] | null; oldRowData?: Row | null } = {},
): ParseMessageResult {
  return { activity: createActivity(metaOf(type), rowData, action, { changedFields }), rowData, oldRowData, tableMeta: metaOf(type) };
}

/** Sends changes through the buffer as one source transaction. @returns What its commit lets through, as `type:action:id`. */
async function commit(changes: ParseMessageResult[]): Promise<string[]> {
  const surviving: PendingEvent[] = [];
  const buffer = new TransactionBuffer(async (events) => {
    surviving.push(...events);
  });

  buffer.onBegin({ tag: 'begin', xid: 1, commitLsn: '0/10', commitTime: BigInt(0) });
  for (const [index, result] of changes.entries()) await buffer.onEvent(`0/${index + 1}`, result, index);
  await buffer.onCommit();

  return surviving.map(({ result: { activity } }) => `${activity.entityType}:${activity.action}:${activity.subjectId}`);
}

const dialect = new PgDialect();

/** A captured host update as the driver would send it, with the bound values of each part flattened. */
function rendered({ table, values, condition }: (typeof statements)[number]) {
  const items = dialect.sqlToQuery(values.items);
  const where = dialect.sqlToQuery(condition);
  return {
    table: getTableName(table),
    items: items.sql,
    strippedIds: items.params.flat(),
    stx: dialect.sqlToQuery(values.stx).sql,
    where: where.sql,
    scope: where.params.flat(),
  };
}

beforeEach(() => {
  statements.length = 0;
});

describe('suppressEmbeddingPropagation: at the commit of a source transaction', () => {
  it('drops the host update that only removes the id of an embedded row the transaction deletes, and keeps the delete', async () => {
    const survivors = await commit([
      change('item', 'delete', itemRow('i1')),
      change('task', 'update', taskRow('t1'), { changedFields: ['items', 'updatedAt'], oldRowData: taskRow('t1', { items: ['i1'] }) }),
    ]);

    expect(survivors).toEqual(['item:delete:i1']);
  });

  it('keeps a host update in a transaction that deletes no embedded row', async () => {
    const survivors = await commit([
      change('task', 'update', taskRow('t1'), { changedFields: ['items', 'updatedAt'], oldRowData: taskRow('t1', { items: ['i1'] }) }),
      change('item', 'update', itemRow('i1'), { changedFields: ['name', 'updatedAt'] }),
    ]);

    expect(survivors).toEqual(['task:update:t1', 'item:update:i1']);
  });

  it('keeps an update of an embedded row in a transaction that deletes a host row', async () => {
    const survivors = await commit([change('task', 'delete', taskRow('t1')), change('item', 'update', itemRow('i1'), { changedFields: ['name'] })]);

    expect(survivors).toEqual(['task:delete:t1', 'item:update:i1']);
  });

  it('as the rule stands, drops every host update of a transaction that deletes an embedded row: it goes by type and reads no changed column', async () => {
    const survivors = await commit([
      change('item', 'delete', itemRow('i1')),
      // A user edit of another column of the host that held the deleted id.
      change('task', 'update', taskRow('t1', { name: 'Renamed', items: ['i1'] }), { changedFields: ['name', 'updatedAt'] }),
      // A user edit of a host that never held it.
      change('task', 'update', taskRow('t2', { name: 'Other' }), { changedFields: ['name', 'updatedAt'] }),
    ]);

    expect(survivors).toEqual(['item:delete:i1']);
  });
});

describe('isEmbeddingCleanupWrite: in the update handler', () => {
  const updatedAt = '2026-10-01T10:00:00.000Z';
  const stored = {
    ...taskRow('t1', { items: ['i1', 'i2'] }),
    updatedAt,
    stx: { mutationId: 'm1', sourceId: 'tab-1', changedFields: ['name', 'updatedAt'] },
  };

  /** An update of the stored row. The cast covers the relation of a pgoutput message: the handler reads the two row images only. */
  const update = (row: Row) => ({ tag: 'update', old: stored, new: row }) as unknown as Pgoutput.MessageUpdate;

  it('must not turn the cleanup write of a host array into an activity', () => {
    // As cleanupEmbeddingReferences writes it: the array without the id, stx without changedFields, updatedAt untouched.
    const cleaned = { ...stored, items: ['i2'], stx: { mutationId: 'm1', sourceId: 'tab-1' } };

    expect(handleUpdate(metaOf('task'), update(cleaned))).toBeNull();
  });

  it('turns a user edit of the same column into an activity', () => {
    // As the API writes it: changedFields names the column and updatedAt.
    const edited = {
      ...stored,
      items: ['i2'],
      updatedAt: '2026-10-01T10:05:00.000Z',
      stx: { mutationId: 'm2', sourceId: 'tab-1', changedFields: ['items', 'updatedAt'] },
    };

    const result = handleUpdate(metaOf('task'), update(edited));

    expect(result?.activity).toMatchObject({ action: 'update', entityType: 'task', subjectId: 't1', changedFields: ['items', 'updatedAt'] });
  });
});

describe('cleanupEmbeddingReferences', () => {
  it('issues the statement that strips a deleted embedded id from the host arrays of its organization', async () => {
    await cleanupEmbeddingReferences(productOf('item'), 'delete', [{ result: change('item', 'delete', itemRow('i1')) }]);

    expect(statements).toHaveLength(1);
    const statement = rendered(statements[0]);
    expect(statement.table).toBe('tasks');
    // The array is rebuilt from its own elements, without the deleted id.
    expect(statement.items).toContain('unnest("tasks"."items")');
    expect(statement.strippedIds).toEqual(['i1']);
    // A bound id list is a list, not an array: Postgres takes it after IN and refuses it after ANY or ALL.
    expect(statement.items).toMatch(/elem NOT IN \(\$\d+\)/);
    expect(statement.items).not.toMatch(/\b(ANY|ALL)\s*\(/);
    // Only hosts that hold the id, in the organization of the embedded row.
    expect(statement.where).toContain('"tasks"."items" &&');
    expect(statement.where).toContain('"tasks"."organization_id" =');
    expect(statement.scope).toEqual(['i1', 'o1']);
    // No changedFields: the update handler reads the write by its WAL diff.
    expect(statement.stx).toBe("stx - 'changedFields'");
  });

  it('strips the id of a soft-deleted embedded row, and issues nothing for an update that deletes nothing', async () => {
    const live = itemRow('i1');
    const softDeleted = itemRow('i2', { deletedAt: '2026-10-01T10:00:00.000Z' });

    await cleanupEmbeddingReferences(productOf('item'), 'update', [
      { result: change('item', 'update', live, { oldRowData: itemRow('i1') }) },
      { result: change('item', 'update', softDeleted, { oldRowData: itemRow('i2') }) },
    ]);

    expect(statements).toHaveLength(1);
    expect(rendered(statements[0]).strippedIds).toEqual(['i2']);

    statements.length = 0;
    await cleanupEmbeddingReferences(productOf('item'), 'update', [{ result: change('item', 'update', live, { oldRowData: itemRow('i1') }) }]);

    expect(statements).toHaveLength(0);
  });

  it('issues one statement per organization', async () => {
    await cleanupEmbeddingReferences(productOf('item'), 'delete', [
      { result: change('item', 'delete', itemRow('i1')) },
      { result: change('item', 'delete', itemRow('i2', { organizationId: 'o2' })) },
      { result: change('item', 'delete', itemRow('i3')) },
    ]);

    expect(statements.map((statement) => rendered(statement).scope)).toEqual([
      ['i1', 'i3', 'o1'],
      ['i2', 'o2'],
    ]);
  });

  it('issues nothing for a product no host embeds', async () => {
    await cleanupEmbeddingReferences(productOf('task'), 'delete', [{ result: change('task', 'delete', taskRow('t1', { items: ['i1'] })) }]);

    expect(statements).toHaveLength(0);
  });
});

describe('embeddingsAfterDispatch: after a group was handed to the API', () => {
  const event = (result: ParseMessageResult): PendingEvent => ({ lsn: '0/1', result });

  it('runs the cleanup for a group of embedded deletes', async () => {
    await embeddingsAfterDispatch(productOf('item'), 'delete', [event(change('item', 'delete', itemRow('i1')))]);

    expect(statements).toHaveLength(1);
    expect(rendered(statements[0]).strippedIds).toEqual(['i1']);
  });

  it('issues nothing for a group of creates', async () => {
    await embeddingsAfterDispatch(productOf('item'), 'create', [event(change('item', 'create', itemRow('i1')))]);

    expect(statements).toHaveLength(0);
  });
});
