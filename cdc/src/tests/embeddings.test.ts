import { getTableName, type SQL } from 'drizzle-orm';
import { type AnyPgTable, PgDialect } from 'drizzle-orm/pg-core';
import type { Pgoutput } from 'pg-logical-replication';
import type { ActivityAction, ProductEntityType } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { PendingEvent, TableMeta } from '../types';

/** Strips the mocked database was asked to run: the table, which hosts were looked up, the set() values and which rows it wrote. */
const statements: Array<{ table: AnyPgTable; lookup: SQL; values: Record<string, SQL>; written: SQL }> = [];

/** The hosts the lookup of a strip finds, and the embedded rows it finds live. */
const world: { hosts: Array<{ id: string }>; liveItems: Array<{ id: string }> } = { hosts: [], liveItems: [] };

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
        { embeddedProductType: 'item', hostProductType: 'task', hostColumn: 'items' },
        // Hydrated from a single reference: the host keeps `mainItemId` and no column of this name.
        { embeddedProductType: 'item', hostProductType: 'task', hostColumn: 'mainItem' },
      ],
    },
  };
});

vi.mock('../lib/db', () => {
  /** One transaction of the strip: the lookup that locks the hosts, and the write. */
  const transaction = async (run: (tx: unknown) => Promise<void>) => {
    let lookup: SQL | undefined;
    const tx = {
      select: () => ({
        from: (table: AnyPgTable) => ({
          where: (condition: SQL) => {
            // The read of embedded rows that are live again is awaited as it stands.
            if (getTableName(table) === 'items') return Promise.resolve(world.liveItems);
            return {
              orderBy: () => ({
                for: async () => {
                  lookup = condition;
                  return world.hosts;
                },
              }),
            };
          },
        }),
      }),
      update: (table: AnyPgTable) => ({
        set: (values: Record<string, SQL>) => ({
          where: async (written: SQL) => {
            if (lookup) statements.push({ table, lookup, values, written });
          },
        }),
      }),
    };
    await run(tx);
  };
  return { cdcDb: { transaction } };
});

// The mock replaces the module, so the one export read here is typed by hand.
const { getEntityTable } = (await import('#/tables')) as unknown as { getEntityTable: (type: string) => AnyPgTable };
const { cleanupEmbeddingReferences } = await import('../embeddings/embedding-cleanup');
const { parseUpdate } = await import('../pipeline/parse-update');
const { createActivity } = await import('../services/create-activity');
const { TransactionBuffer } = await import('../services/transaction-buffer');
const { computeBatchUnifiedDeltas } = await import('../utils/compute-unified-deltas');

type SyntheticProduct = 'task' | 'item';
/** A channel of the deep fixture: its rows are in no synthetic table, and no path here reads one. */
type SyntheticChannel = 'course' | 'courseSection' | 'project';
type Row = Record<string, unknown> & { id: string };

/** The synthetic products are no product of the app, so their names are widened where the worker asks for one. */
const productOf = (type: SyntheticProduct) => type as ProductEntityType;

/** A registry entry of a synthetic table: its kind, type and drizzle table. The cast covers the column map, which these paths read as absent. */
const metaOf = (type: SyntheticProduct | SyntheticChannel) =>
  ({ kind: 'entity', type, table: getEntityTable(type), columnNameMap: new Map() }) as unknown as TableMeta;

const ancestors = { organizationId: 'o1', courseId: 'c1', courseSectionId: 's1', projectId: 'p1' };
const taskRow = (id: string, values: Record<string, unknown> = {}): Row => ({ id, ...ancestors, name: 'Task', items: [], ...values });
const itemRow = (id: string, values: Record<string, unknown> = {}): Row => ({ id, ...ancestors, deletedAt: null, ...values });

/** A parsed change of a synthetic row, with the activity the worker builds for it. */
function change(type: SyntheticProduct | SyntheticChannel, action: ActivityAction, rowData: Row, oldRowData: Row | null = null): ParseMessageResult {
  return { activity: createActivity(metaOf(type), rowData, action), rowData, oldRowData, tableMeta: metaOf(type) };
}

/** Sends changes through the buffer as one source transaction. @returns The changes its commit lets through. */
async function commitEvents(changes: ParseMessageResult[]): Promise<PendingEvent[]> {
  const surviving: PendingEvent[] = [];
  const buffer = new TransactionBuffer(async (events) => {
    surviving.push(...events);
  });

  buffer.onBegin({ tag: 'begin', xid: 1, commitLsn: '0/10', commitTime: BigInt(0) });
  for (const [index, result] of changes.entries()) await buffer.onEvent(`0/${index + 1}`, result, index);
  await buffer.onCommit('0/18');

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
    where: where.sql,
    scope: where.params.flat(),
    writtenIds: dialect.sqlToQuery(written).params.flat(),
  };
}

beforeEach(() => {
  statements.length = 0;
  // One host that holds every id a case strips, unless the case says otherwise.
  world.hosts = [{ id: 't1' }];
  world.liveItems = [];
});

describe('isReferenceCleanupWrite: in the update handler', () => {
  const updatedAt = '2026-10-01T10:00:00.000Z';
  const stored = {
    ...taskRow('t1', { items: ['i1', 'i2'] }),
    updatedAt,
    stx: { mutationId: 'm1', sourceId: 'tab-1', fieldTimestamps: {} },
  };

  /** An update of the stored row. The cast covers the relation of a pgoutput message: the handler reads the two row images only. */
  const update = (row: Row) => ({ tag: 'update', old: stored, new: row }) as unknown as Pgoutput.MessageUpdate;

  it('must not turn the cleanup write of a host array into an activity', () => {
    // As cleanupEmbeddingReferences writes it: the array without the id, nothing else.
    const cleaned = { ...stored, items: ['i2'] };

    expect(parseUpdate(metaOf('task'), update(cleaned))).toBeNull();
  });

  it('turns a user edit of the same column into an activity', () => {
    // As the API writes it: the column and updatedAt move.
    const edited = {
      ...stored,
      items: ['i2'],
      updatedAt: '2026-10-01T10:05:00.000Z',
      stx: { mutationId: 'm2', sourceId: 'tab-1', fieldTimestamps: {} },
    };

    const result = parseUpdate(metaOf('task'), update(edited));

    expect(result?.activity).toMatchObject({ action: 'update', entityType: 'task', subjectId: 't1', changedFields: ['items', 'updatedAt'] });
  });

  it('must not take a column of the same name on another table for an embedding column', () => {
    // An item row has no embedding: a write to a column it happens to call `items` is a change like any other.
    const before = { ...itemRow('i1'), items: ['x'], stx: { mutationId: 'm1', sourceId: 'tab-1' } };
    const after = { ...before, items: [] };
    const message = { tag: 'update', old: before, new: after } as unknown as Pgoutput.MessageUpdate;

    expect(parseUpdate(metaOf('item'), message)?.activity).toMatchObject({ action: 'update', entityType: 'item', changedFields: ['items'] });
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
  });

  it('strips the id of a soft-deleted embedded row, and issues nothing for an update that deletes nothing', async () => {
    const live = itemRow('i1');
    const softDeleted = itemRow('i2', { deletedAt: '2026-10-01T10:00:00.000Z' });

    await cleanupEmbeddingReferences(productOf('item'), 'update', [
      { result: change('item', 'update', live, itemRow('i1')) },
      { result: change('item', 'update', softDeleted, itemRow('i2')) },
    ]);

    expect(statements).toHaveLength(1);
    expect(rendered(statements[0]).strippedIds).toEqual(['i2']);

    statements.length = 0;
    await cleanupEmbeddingReferences(productOf('item'), 'update', [{ result: change('item', 'update', live, itemRow('i1')) }]);

    expect(statements).toHaveLength(0);
  });

  it('keeps the id of a soft-deleted row that a host write brought back before the strip ran', async () => {
    const deletedAt = '2026-10-01T10:00:00.000Z';
    world.liveItems = [{ id: 'i1' }];

    await cleanupEmbeddingReferences(productOf('item'), 'update', [
      { result: change('item', 'update', itemRow('i1', { deletedAt }), itemRow('i1')) },
      { result: change('item', 'update', itemRow('i2', { deletedAt }), itemRow('i2')) },
    ]);

    expect(statements).toHaveLength(1);
    expect(rendered(statements[0]).strippedIds).toEqual(['i2']);

    statements.length = 0;
    await cleanupEmbeddingReferences(productOf('item'), 'update', [
      { result: change('item', 'update', itemRow('i1', { deletedAt }), itemRow('i1')) },
    ]);

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
    world.hosts = [{ id: 't1' }, { id: 't2' }];

    await cleanupEmbeddingReferences(productOf('item'), 'delete', [{ result: change('item', 'delete', itemRow('i1')) }]);

    expect(rendered(statements[0]).writtenIds).toEqual(['t1', 't2']);
  });

  it('writes nothing when the lookup finds no host, as on a second delivery of the same delete', async () => {
    world.hosts = [];

    await cleanupEmbeddingReferences(productOf('item'), 'delete', [{ result: change('item', 'delete', itemRow('i1')) }]);

    expect(statements).toHaveLength(0);
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
      change('task', 'delete', taskRow('t1', { items: ['i9'] })),
    ]);

    expect(others).toEqual([]);
    expect(channelDelete.result.activity).toMatchObject({ entityType: 'project', action: 'delete' });
    expect(counts(channelDelete)).toEqual({
      o1: { 'e:c:item': -2, 'e:c:task': -1 },
      c1: { 'e:c:item': -2, 'e:c:task': -1 },
      s1: { 'e:c:item': -2, 'e:c:task': -1 },
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

    // The project itself, the item that went with it, and the version of the signal that tells readers the item went.
    // The section was the project's home.
    expect(countDeltasByChannelKey.get('o1')).toEqual({ 'e:c:project': -1, 'e:c:item': -1, 's:channel.deleted': 1 });
    expect(countDeltasByChannelKey.get('s1')).toEqual({ 'e:c:project': -1, 'e:c:h:project': -1, 'e:c:item': -1 });
  });
});
