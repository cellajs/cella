import { eq } from 'drizzle-orm';
import pg from 'pg';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbOrTx } from '#/db/create-connection';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';
import type { DocScope } from '../../constants';
import { db, withRlsTx } from '../../data/db';
import {
  appendUpdate,
  compactState,
  deleteDoc,
  discardLogRows,
  ensureDoc,
  loadBase,
  readLog,
  touchDoc,
} from '../../data/storage';
import { mergeState } from '../../sync/document-state';
import { mapUpdate, readMap, undecodableUpdate } from '../helpers';
import { cleanupSeed, seedOrg } from './seed';

// A dedicated tenant/user so parallel tests do not collide.
const testTenantId = 'yjs-integ-tenant';
const testUserId = '00000000-0000-4000-a000-0000000000aa';
const testOrgId = '00000000-0000-4000-a000-000000000001';

function ctx(entityId: string): DocScope {
  return {
    // The Yjs tables have no FK to the entity table, so any product type works.
    entityType: appConfig.productEntityTypes[0],
    entityId,
    tenantId: testTenantId,
    organizationId: testOrgId,
  };
}

const ids = {
  lifecycle: '10000000-0000-4000-a000-000000000001',
  idempotent: '10000000-0000-4000-a000-000000000002',
  compaction: '10000000-0000-4000-a000-000000000003',
  nonexistent: '10000000-0000-4000-a000-000000000004',
  rls: '10000000-0000-4000-a000-000000000005',
  discard: '10000000-0000-4000-a000-000000000006',
  retire: '10000000-0000-4000-a000-000000000007',
};

describe('6.1 Storage: session row, update log, compaction', () => {
  let adminClient: pg.Client;

  beforeAll(async () => {
    adminClient = new pg.Client({ connectionString: testDatabaseUrl });
    await adminClient.connect();
    await cleanupSeed(adminClient, { tenantIds: [testTenantId] });
    // The rows the RLS context's foreign keys need.
    await seedOrg(adminClient, testTenantId, testOrgId, 'yjs-integ-org');
  });

  afterAll(async () => {
    await cleanupSeed(adminClient, { tenantIds: [testTenantId] });
    await adminClient.end();
  });

  it('ensure → append → read → compact → delete lifecycle', async () => {
    const c = ctx(ids.lifecycle);
    const seed = mapUpdate('seed', true);
    expect(await loadBase(c)).toBeNull();
    const { state, generation } = await ensureDoc(c, seed);
    expect(state).toEqual(seed);

    expect(await appendUpdate(c, testUserId, mapUpdate('a', 1), generation)).toBe(true);
    expect(await appendUpdate(c, '00000000-0000-4000-a000-0000000000bb', mapUpdate('b', 2), generation)).toBe(true);
    const rows = await readLog(c);
    expect(rows.map((row) => row.userId)).toEqual([testUserId, '00000000-0000-4000-a000-0000000000bb']);
    expect(rows[0].id).toBeLessThan(rows[1].id);

    const merged = mergeState(
      (await loadBase(c))!.state,
      rows.map((row) => row.payload),
    )!;
    expect(
      await compactState(
        c,
        merged,
        rows.map((row) => row.id),
        generation,
      ),
    ).toBe(true);
    expect(readMap((await loadBase(c))!.state)).toEqual({ seed: true, a: 1, b: 2 });
    expect(await readLog(c)).toEqual([]);

    await deleteDoc(c);
    expect(await loadBase(c)).toBeNull();
  });

  it('ensureDoc keeps the first seed and its generation, and returns them to a concurrent second connector', async () => {
    const c = ctx(ids.idempotent);
    const first = mapUpdate('first', true);
    const [a, b] = await Promise.all([ensureDoc(c, first), ensureDoc(c, mapUpdate('second', true))]);
    expect(readMap(a.state)).toEqual({ first: true });
    expect(b).toEqual(a);
    expect(await ensureDoc(c, null)).toEqual(a);
    await deleteDoc(c);
  });

  it('a retired document reseeds under a new generation, takes no write of the old one, and touchDoc reports whether the row exists', async () => {
    const c = ctx(ids.retire);
    const first = await ensureDoc(c, mapUpdate('first', true));
    expect(await touchDoc(c)).toBe(true);
    await deleteDoc(c);
    expect(await touchDoc(c)).toBe(false);
    // An update or a compaction of the retired generation writes nothing, before and after the reseed.
    expect(await appendUpdate(c, testUserId, mapUpdate('late', true), first.generation)).toBe(false);
    const second = await ensureDoc(c, mapUpdate('second', true));
    expect(readMap(second.state)).toEqual({ second: true });
    expect(second.generation).not.toBe(first.generation);
    expect(await appendUpdate(c, testUserId, mapUpdate('late', true), first.generation)).toBe(false);
    expect(await compactState(c, mapUpdate('old history', true), [], first.generation)).toBe(false);
    expect(readMap((await loadBase(c))!.state)).toEqual({ second: true });
    expect(await readLog(c)).toEqual([]);
    await deleteDoc(c);
  });

  it('twenty concurrent appends all land, and compaction deletes only the rows it was given', async () => {
    const c = ctx(ids.compaction);
    const { generation } = await ensureDoc(c, null);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => appendUpdate(c, testUserId, mapUpdate(`k${i}`, i), generation)),
    );
    const rows = await readLog(c);
    expect(rows).toHaveLength(20);

    // An append that lands after the read and before the compaction write survives.
    const read = rows.slice(0, 20);
    await appendUpdate(c, testUserId, mapUpdate('late', true), generation);
    const merged = mergeState(
      (await loadBase(c))!.state,
      read.map((row) => row.payload),
    )!;
    await compactState(
      c,
      merged,
      read.map((row) => row.id),
      generation,
    );

    const remaining = await readLog(c);
    expect(remaining).toHaveLength(1);
    expect(readMap(remaining[0].payload)).toEqual({ late: true });
    const base = readMap((await loadBase(c))!.state);
    expect(Object.keys(base)).toHaveLength(20);
    await deleteDoc(c);
  });

  it('discardLogRows deletes exactly the rows it was given, in the document it names', async () => {
    const c = ctx(ids.discard);
    const other = ctx(ids.compaction);
    const { generation } = await ensureDoc(c, null);
    const otherGeneration = (await ensureDoc(other, null)).generation;
    await appendUpdate(c, testUserId, mapUpdate('a', 1), generation);
    await appendUpdate(c, testUserId, undecodableUpdate, generation);
    await appendUpdate(other, testUserId, mapUpdate('elsewhere', true), otherGeneration);
    const [kept, bad] = await readLog(c);
    const [elsewhere] = await readLog(other);

    // An id of another document's row is ignored: the delete is scoped to the document.
    await discardLogRows(c, [bad.id, elsewhere.id]);
    expect((await readLog(c)).map((row) => row.id)).toEqual([kept.id]);
    expect((await readLog(other)).map((row) => row.id)).toEqual([elsewhere.id]);
    await deleteDoc(c);
    await deleteDoc(other);
  });

  it('loadBase and readLog are empty for a non-existent doc, and deleteDoc is safe on it', async () => {
    const c = ctx(ids.nonexistent);
    expect(await loadBase(c)).toBeNull();
    expect(await readLog(c)).toEqual([]);
    await expect(deleteDoc(c)).resolves.toBeUndefined();
  });

  it('rows are invisible to the runtime role without tenant context and from another tenant', async () => {
    const c = ctx(ids.rls);
    const { generation } = await ensureDoc(c, mapUpdate('seed', true));
    await appendUpdate(c, testUserId, mapUpdate('a', 1), generation);

    // Selected by entity id alone on the relay's own (runtime role) pool, so the RLS policies alone decide what comes back.
    const rowsVisible = async (tenantId: string | null): Promise<[number, number]> => {
      const read = async (conn: DbOrTx): Promise<[number, number]> => {
        const docs = await conn
          .select({ id: yjsDocumentsTable.entityId })
          .from(yjsDocumentsTable)
          .where(eq(yjsDocumentsTable.entityId, ids.rls));
        const log = await conn
          .select({ id: yjsUpdatesTable.id })
          .from(yjsUpdatesTable)
          .where(eq(yjsUpdatesTable.entityId, ids.rls));
        return [docs.length, log.length];
      };
      return tenantId === null ? read(db) : withRlsTx(tenantId, '', read);
    };
    expect(await rowsVisible('some-other-tenant')).toEqual([0, 0]);
    expect(await rowsVisible(null)).toEqual([0, 0]);
    // Positive control: the document's own tenant sees both rows, as the superuser does.
    expect(await rowsVisible(testTenantId)).toEqual([1, 1]);
    const docs = await adminClient.query('SELECT 1 FROM yjs_documents WHERE entity_id = $1', [ids.rls]);
    const log = await adminClient.query('SELECT 1 FROM yjs_updates WHERE entity_id = $1', [ids.rls]);
    expect(docs.rowCount).toBe(1);
    expect(log.rowCount).toBe(1);
    await deleteDoc(c);
  });
});
