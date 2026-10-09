import { getTableName, type SQL } from 'drizzle-orm';
import { type AnyPgTable, PgDialect } from 'drizzle-orm/pg-core';
import type { Pgoutput } from 'pg-logical-replication';
import type { ActivityAction, ProductEntityType } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { PendingEvent, TableMeta } from '../types';

/** Strips the mocked database was asked to run: the table, which hosts were looked up, the set() values and which rows it wrote. */
const statements: Array<{ table: AnyPgTable; lookup: SQL; values: Record<string, SQL>; written: SQL }> = [];

/** Counter statements the mocked database was asked to run, in the transaction of a strip. */
const booked: SQL[] = [];

/** The hosts the lookup of a strip finds: their id, the ids they hold, and what says whether they count. */
const world: { hosts: Array<{ id: string; held: string[]; deletedAt: string | null }> } = { hosts: [] };

// A host `task` that holds `item` ids in its `items` column, on synthetic tables.
vi.mock('#/tables', async () => {
  const { pgTable, jsonb, text, uuid } = await import('drizzle-orm/pg-core');

  const tasks = pgTable('tasks', {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    name: text('name'),
    items: uuid('items').array().notNull(),
    mainItemId: uuid('main_item_id'),
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
      productEmbeddings: [
        { embeddedProduct: 'item', hostProduct: 'task', hostColumn: 'items' },
        // Hydrated from a single reference: the host keeps `mainItemId` and no column of this name.
        { embeddedProduct: 'item', hostProduct: 'task', hostColumn: 'mainItem' },
      ],
    },
  };
});

vi.mock('../lib/db', () => {
  /** One transaction of the strip: the lookup that locks the hosts, the write, and the counter statements. */
  const transaction = async (run: (tx: unknown) => Promise<void>) => {
    let lookup: SQL | undefined;
    const tx = {
      select: () => ({
        from: () => ({
          where: (condition: SQL) => ({
            orderBy: () => ({
              for: async () => {
                lookup = condition;
                return world.hosts;
              },
            }),
          }),
        }),
      }),
      update: (table: AnyPgTable) => ({
        set: (values: Record<string, SQL>) => ({
          where: async (written: SQL) => {
            if (lookup) statements.push({ table, lookup, values, written });
          },
        }),
      }),
      execute: async (statement: SQL) => {
        booked.push(statement);
        return { rows: [{ counts: {} }] };
      },
    };
    await run(tx);
  };
  return { cdcDb: { transaction } };
});

// The mock replaces the module, so the one export read here is typed by hand.
const { getEntityTable } = (await import('#/tables')) as unknown as { getEntityTable: (type: string) => AnyPgTable };
const { embeddingsAfterDispatch } = await import('../embeddings');
const { cleanupEmbeddingReferences } = await import('../embeddings/embedding-cleanup');
const { handleUpdate } = await import('../handlers/update');
const { createActivity } = await import('../services/create-activity');
const { TransactionBuffer } = await import('../services/transaction-buffer');
const { getCountDeltas } = await import('../utils/update-counts');
const { computeBatchUnifiedDeltas } = await import('../utils/compute-unified-deltas');

type SyntheticProduct = 'task' | 'item';
/** A channel of the deep fixture: its rows are in no synthetic table, and no path here reads one. */
type SyntheticChannel = 'course' | 'courseSection' | 'project';
type Row = Record<string, unknown> & { id: string };

/** The synthetic products are no product of the app, so their names are widened where the worker asks for one. */
const productOf = (type: SyntheticProduct) => type as ProductEntityType;

/** A registry entry of a synthetic table: its kind, type and drizzle table. The cast covers the column map, which these paths read as absent. */
const metaOf = (type: SyntheticProduct | SyntheticChannel) => ({ kind: 'entity', type, table: getEntityTable(type) }) as unknown as TableMeta;

const ancestors = { organizationId: 'o1', courseId: 'c1', courseSectionId: 's1', projectId: 'p1' };
const taskRow = (id: string, values: Record<string, unknown> = {}): Row => ({ id, ...ancestors, name: 'Task', items: [], ...values });
const itemRow = (id: string, values: Record<string, unknown> = {}): Row => ({ id, ...ancestors, deletedAt: null, ...values });

/** A parsed change of a synthetic row, with the activity the worker builds for it. */
function change(
  type: SyntheticProduct | SyntheticChannel,
  action: ActivityAction,
  rowData: Row,
  { changedFields = null, oldRowData = null }: { changedFields?: string[] | null; oldRowData?: Row | null } = {},
): ParseMessageResult {
  return { activity: createActivity(metaOf(type), rowData, action, { changedFields }), rowData, oldRowData, tableMeta: metaOf(type) };
}

/** Sends changes through the buffer as one source transaction. @returns What its commit lets through, as `type:action:id`. */
async function commit(changes: ParseMessageResult[]): Promise<string[]> {
  return (await commitEvents(changes)).map(({ result: { activity } }) => `${activity.entityType}:${activity.action}:${activity.subjectId}`);
}

/** Sends changes through the buffer as one source transaction. @returns The changes its commit lets through. */
async function commitEvents(changes: ParseMessageResult[]): Promise<PendingEvent[]> {
  const surviving: PendingEvent[] = [];
  const buffer = new TransactionBuffer(async (events) => {
    surviving.push(...events);
  });

  buffer.onBegin({ tag: 'begin', xid: 1, commitLsn: '0/10', commitTime: BigInt(0) });
  for (const [index, result] of changes.entries()) await buffer.onEvent(`0/${index + 1}`, result, index);
  await buffer.onCommit();

  return surviving;
}

const dialect = new PgDialect();

/** A captured strip as the driver would send it, with the bound values of each part flattened. */
function rendered({ table, lookup, values, written }: (typeof statements)[number]) {
  const items = dialect.sqlToQuery(values.items);
  const where = dialect.sqlToQuery(lookup);
  return {
    table: getTableName(table),
    items: items.sql,
    strippedIds: items.params.flat(),
    stx: dialect.sqlToQuery(values.stx).sql,
    where: where.sql,
    scope: where.params.flat(),
    writtenIds: dialect.sqlToQuery(written).params.flat(),
  };
}

/** The counter statements as `channel key: deltas`. */
const bookedDeltas = () =>
  booked.map((statement) => {
    const [channelKey, deltas] = dialect.sqlToQuery(statement).params as [string, string];
    return { channelKey, deltas: JSON.parse(deltas) };
  });

beforeEach(() => {
  statements.length = 0;
  booked.length = 0;
  // One live host that holds every id a case strips, unless the case says otherwise.
  world.hosts = [{ id: 't1', held: ['i1', 'i2', 'i3'], deletedAt: null }];
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

  it('must not drop a user edit of a host row because the transaction deletes an embedded row: it reads the changed columns', async () => {
    const survivors = await commit([
      change('item', 'delete', itemRow('i1')),
      // A user edit of another column of the host that held the deleted id.
      change('task', 'update', taskRow('t1', { name: 'Renamed', items: ['i1'] }), { changedFields: ['name', 'updatedAt'] }),
      // An edit that renames the host and drops the id in one write.
      change('task', 'update', taskRow('t2', { name: 'Other' }), { changedFields: ['name', 'items', 'updatedAt'] }),
    ]);

    expect(survivors).toEqual(['item:delete:i1', 'task:update:t1', 'task:update:t2']);
  });

  it('must not drop the soft delete of a host row in a transaction that deletes an embedded row: its count would never go down', async () => {
    const deleted = taskRow('t1', { deletedAt: '2026-10-01T10:00:00.000Z' });
    const survivors = await commit([
      change('item', 'delete', itemRow('i1')),
      change('task', 'update', deleted, { changedFields: ['deletedAt', 'updatedAt', 'updatedBy'], oldRowData: taskRow('t1', { deletedAt: null }) }),
    ]);

    expect(survivors).toEqual(['item:delete:i1', 'task:update:t1']);
  });

  it('drops the propagation of a single reference, which the host keeps in an id column', async () => {
    const survivors = await commit([
      change('item', 'delete', itemRow('i1')),
      change('task', 'update', taskRow('t1'), { changedFields: ['mainItemId', 'updatedAt', 'updatedBy'] }),
    ]);

    expect(survivors).toEqual(['item:delete:i1']);
  });

  it('keeps a host update whose columns refer to a type the transaction does not delete', async () => {
    const survivors = await commit([
      change('task', 'delete', taskRow('t9')),
      change('task', 'update', taskRow('t1'), { changedFields: ['items', 'updatedAt'] }),
    ]);

    expect(survivors).toEqual(['task:delete:t9', 'task:update:t1']);
  });

  it('keeps a host update whose changed columns are unknown', async () => {
    const survivors = await commit([change('item', 'delete', itemRow('i1')), change('task', 'update', taskRow('t1'))]);

    expect(survivors).toEqual(['item:delete:i1', 'task:update:t1']);
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

  it('must not take a column of the same name on another table for an embedding column', () => {
    // An item row has no embedding: a write to a column it happens to call `items` is a change like any other.
    const before = { ...itemRow('i1'), items: ['x'], stx: { mutationId: 'm1', sourceId: 'tab-1' } };
    const after = { ...before, items: [] };
    const message = { tag: 'update', old: before, new: after } as unknown as Pgoutput.MessageUpdate;

    expect(handleUpdate(metaOf('item'), message)?.activity).toMatchObject({ action: 'update', entityType: 'item', changedFields: ['items'] });
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

  it('writes the hosts it looked up and locked, and no other', async () => {
    world.hosts = [
      { id: 't1', held: ['i1'], deletedAt: null },
      { id: 't2', held: ['i1', 'i9'], deletedAt: null },
    ];

    await cleanupEmbeddingReferences(productOf('item'), 'delete', [{ result: change('item', 'delete', itemRow('i1')) }]);

    expect(rendered(statements[0]).writtenIds).toEqual(['t1', 't2']);
  });

  it('books one use less per live host that held the id: the strip comes back as no activity, so nothing else would', async () => {
    world.hosts = [
      { id: 't1', held: ['i1', 'i2'], deletedAt: null },
      { id: 't2', held: ['i1', 'i9'], deletedAt: null },
      // A soft-deleted host is stripped too, and its references were taken off when it was deleted.
      { id: 't3', held: ['i1', 'i2'], deletedAt: '2026-10-01T10:00:00.000Z' },
    ];

    await cleanupEmbeddingReferences(productOf('item'), 'delete', [
      { result: change('item', 'delete', itemRow('i1')) },
      { result: change('item', 'delete', itemRow('i2')) },
    ]);

    expect(bookedDeltas()).toEqual([
      { channelKey: 'i1', deltas: { 'e:c:task': -2 } },
      { channelKey: 'i2', deltas: { 'e:c:task': -1 } },
    ]);
  });

  it('must not book a strip that finds no host, as on a second delivery of the same delete', async () => {
    world.hosts = [];

    await cleanupEmbeddingReferences(productOf('item'), 'delete', [{ result: change('item', 'delete', itemRow('i1')) }]);

    expect(statements).toHaveLength(0);
    expect(booked).toHaveLength(0);
  });
});

describe('a channel delete that takes rows with it', () => {
  const projectRow = { id: 'p1', organizationId: 'o1', courseId: 'c1', courseSectionId: 's1' };
  const counts = (event: PendingEvent) => Object.fromEntries(event.cascadeCounts ?? []);

  it('must not lose those rows from the counts of the channels above: their deletes are suppressed, and the channel delete carries the numbers', async () => {
    const [channelDelete, ...others] = await commitEvents([
      change('project', 'delete', projectRow),
      change('item', 'delete', itemRow('i1')),
      change('item', 'delete', itemRow('i2')),
      // A host that goes with the channel no longer uses the row it held.
      change('task', 'delete', taskRow('t1', { items: ['i9'] })),
    ]);

    expect(others).toEqual([]);
    expect(channelDelete.result.activity).toMatchObject({ entityType: 'project', action: 'delete' });
    expect(counts(channelDelete)).toEqual({
      o1: { 'e:c:item': -2, 'e:c:task': -1 },
      c1: { 'e:c:item': -2, 'e:c:task': -1 },
      s1: { 'e:c:item': -2, 'e:c:task': -1 },
      i9: { 'e:c:task': -1 },
    });
  });

  it('counts a row whose delete arrived before the delete of its channel', async () => {
    const [channelDelete] = await commitEvents([change('item', 'delete', itemRow('i1')), change('project', 'delete', projectRow)]);

    expect(counts(channelDelete).o1).toEqual({ 'e:c:item': -1 });
  });

  it('must not take a soft-deleted row off a second time', async () => {
    const [channelDelete] = await commitEvents([
      change('project', 'delete', projectRow),
      change('item', 'delete', itemRow('i1', { deletedAt: '2026-10-01T10:00:00.000Z' })),
    ]);

    expect(channelDelete.cascadeCounts).toBeUndefined();
  });

  it('gives the numbers to one change when channels go together: a row is taken off each channel above once', async () => {
    const survivors = await commitEvents([
      change('course', 'delete', { id: 'c1', organizationId: 'o1' }),
      change('courseSection', 'delete', { id: 's1', organizationId: 'o1', courseId: 'c1' }),
      change('project', 'delete', projectRow),
      change('item', 'delete', itemRow('i1')),
    ]);

    expect(survivors.map(({ result: { activity } }) => activity.entityType)).toEqual(['course', 'courseSection', 'project']);
    // Only the organization remains above: the three channels are gone, and so are their books.
    expect(survivors.map(counts)).toEqual([{ o1: { 'e:c:item': -1 } }, {}, {}]);
  });

  it('reaches the counter deltas of the flush through the channel delete', async () => {
    const survivors = await commitEvents([change('project', 'delete', projectRow), change('item', 'delete', itemRow('i1'))]);

    const { countDeltasByChannelKey } = computeBatchUnifiedDeltas(survivors);

    // The project itself, and the item that went with it. The section was the project's home.
    expect(countDeltasByChannelKey.get('o1')).toEqual({ 'e:c:project': -1, 'e:c:item': -1 });
    expect(countDeltasByChannelKey.get('s1')).toEqual({ 'e:c:project': -1, 'e:c:h:project': -1, 'e:c:item': -1 });
  });
});

describe('usage counts: how many countable hosts hold an embedded row', () => {
  const at = '2026-10-01T10:00:00.000Z';
  const usage = (action: ActivityAction, row: Row, oldRow: Row | null = null) =>
    getCountDeltas(metaOf('task'), createActivity(metaOf('task'), row, action), row, oldRow)
      .filter(({ channelKey }) => channelKey.startsWith('i'))
      .map(({ channelKey, deltas }) => `${channelKey}:${deltas['e:c:task']}`);

  it('counts the ids a new host holds, and takes them off when the host is deleted', () => {
    expect(usage('create', taskRow('t1', { items: ['i1', 'i2'] }))).toEqual(['i1:1', 'i2:1']);
    expect(usage('delete', taskRow('t1', { items: ['i1', 'i2'] }))).toEqual(['i1:-1', 'i2:-1']);
  });

  it('follows an edit of the array of a live host', () => {
    expect(usage('update', taskRow('t1', { items: ['i2', 'i3'] }), taskRow('t1', { items: ['i1', 'i2'] }))).toEqual(['i3:1', 'i1:-1']);
  });

  it('must not keep the references of a soft-deleted host: the recount reads live hosts only', () => {
    const live = taskRow('t1', { items: ['i1', 'i2'], deletedAt: null });
    const deleted = { ...live, deletedAt: at };

    expect(usage('update', deleted, live)).toEqual(['i1:-1', 'i2:-1']);
    expect(usage('update', live, deleted)).toEqual(['i1:1', 'i2:1']);
  });

  it('must not take the references off a second time when a soft-deleted host is removed for good', () => {
    expect(usage('delete', taskRow('t1', { items: ['i1'], deletedAt: at }))).toEqual([]);
  });

  it('counts what a host holds at the moment it is restored', () => {
    const deleted = taskRow('t1', { items: ['i1', 'i2'], deletedAt: at });
    // The strip of a deleted id reached the host while it was soft-deleted.
    const restored = taskRow('t1', { items: ['i2'], deletedAt: null });

    expect(usage('update', restored, deleted)).toEqual(['i2:1']);
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
