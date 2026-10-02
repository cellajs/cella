import { setTimeout as sleep } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbOrTx } from '#/db/create-connection';
import { mergeState } from '#/modules/yjs/helpers/yjs-state';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';
import type { DocScope } from '../../constants';
import { db, withRlsTx } from '../../data/db';
import { appendUpdate, compactState, deleteDoc, discardLogRows, loadDocument, seedDocument, touchDoc } from '../../data/storage';
import { mapUpdate, readMap, undecodableUpdate } from '../helpers';
import { cleanupSeed, insertDocument, seedOrg } from './seed';

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
  noEntity: '10000000-0000-4000-a000-000000000002',
  compaction: '10000000-0000-4000-a000-000000000003',
  nonexistent: '10000000-0000-4000-a000-000000000004',
  rls: '10000000-0000-4000-a000-000000000005',
  discard: '10000000-0000-4000-a000-000000000006',
  retire: '10000000-0000-4000-a000-000000000007',
  overlap: '10000000-0000-4000-a000-000000000008',
  consistent: '10000000-0000-4000-a000-000000000009',
};

/** The id an append got; fails the test for any other outcome. */
async function appended(doc: DocScope, userId: string | null, payload: Uint8Array, generation: string): Promise<number> {
  const result = await appendUpdate(doc, userId, payload, generation);
  if (result.status !== 'appended') throw new Error(`append ${result.status}`);
  return result.id;
}

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

  it('insert → append → read → compact → delete lifecycle', async () => {
    const c = ctx(ids.lifecycle);
    const seed = mapUpdate('seed', true);
    expect(await loadDocument(c)).toBeNull();
    const generation = await insertDocument(adminClient, c, seed);

    const first = await appended(c, testUserId, mapUpdate('a', 1), generation);
    const second = await appended(c, null, mapUpdate('b', 2), generation);
    expect(first).toBeLessThan(second);
    const document = (await loadDocument(c))!;
    expect(document.generation).toBe(generation);
    expect(document.base).toEqual(seed);
    expect(document.rows.map((row) => [row.id, row.userId])).toEqual([
      [first, testUserId],
      [second, null],
    ]);

    const merged = mergeState(
      document.base,
      document.rows.map((row) => row.payload),
    )!;
    expect(await compactState(c, merged, [first, second], generation)).toBe('ok');
    const folded = (await loadDocument(c))!;
    expect(readMap(folded.base)).toEqual({ seed: true, a: 1, b: 2 });
    expect(folded.rows).toEqual([]);

    await deleteDoc(c);
    expect(await loadDocument(c)).toBeNull();
  });

  it('seeds nothing for an entity with no live row: a deleted entity gets no document back', async () => {
    const c = ctx(ids.noEntity);
    expect(await seedDocument(c, () => mapUpdate('seed', true))).toBeNull();
    expect(await loadDocument(c)).toBeNull();
  });

  it('a retired document takes no write of its generation, and a reseed none of the old one', async () => {
    const c = ctx(ids.retire);
    const first = await insertDocument(adminClient, c, mapUpdate('first', true));
    expect(await touchDoc(c)).toBe(true);
    await deleteDoc(c);
    expect(await touchDoc(c)).toBe(false);
    // An update or a compaction of the retired generation writes nothing, before and after the reseed.
    expect(await appendUpdate(c, testUserId, mapUpdate('late', true), first)).toEqual({ status: 'no-document' });
    const second = await insertDocument(adminClient, c, mapUpdate('second', true));
    expect(second).not.toBe(first);
    expect(await appendUpdate(c, testUserId, mapUpdate('late', true), first)).toEqual({ status: 'stale-generation', generation: second });
    expect(await compactState(c, mapUpdate('old history', true), [], first)).toBe('retired');
    const document = (await loadDocument(c))!;
    expect(document.generation).toBe(second);
    expect(readMap(document.base)).toEqual({ second: true });
    expect(document.rows).toEqual([]);
    await deleteDoc(c);
  });

  it('twenty concurrent appends all land, and compaction deletes only the rows it was given', async () => {
    const c = ctx(ids.compaction);
    const generation = await insertDocument(adminClient, c, new Uint8Array());
    await Promise.all(Array.from({ length: 20 }, (_, i) => appended(c, testUserId, mapUpdate(`k${i}`, i), generation)));
    const read = (await loadDocument(c))!;
    expect(read.rows).toHaveLength(20);

    // An append that lands after the read and before the compaction write survives.
    const late = await appended(c, testUserId, mapUpdate('late', true), generation);
    const merged = mergeState(
      read.base,
      read.rows.map((row) => row.payload),
    )!;
    expect(
      await compactState(
        c,
        merged,
        read.rows.map((row) => row.id),
        generation,
      ),
    ).toBe('ok');

    const remaining = (await loadDocument(c))!.rows;
    expect(remaining.map((row) => row.id)).toEqual([late]);
    expect(Object.keys(readMap((await loadDocument(c))!.base))).toHaveLength(20);
    await deleteDoc(c);
  });

  it('must not let two compactions both fold one row: the later is rolled back, and the earlier base stays', async () => {
    const c = ctx(ids.overlap);
    const generation = await insertDocument(adminClient, c, mapUpdate('seed', true));
    const early = (await loadDocument(c))!;
    await appended(c, testUserId, mapUpdate('a', 1), generation);
    await appended(c, testUserId, mapUpdate('b', 2), generation);
    const later = (await loadDocument(c))!;
    const laterIds = later.rows.map((row) => row.id);
    const mergeOf = (read: typeof later) =>
      mergeState(
        read.base,
        read.rows.map((row) => row.payload),
      )!;

    // Two relays during a rollout: one folds the window it read; the other read only the first row, before the second
    // was logged, and would replace that base with one lacking `b`.
    expect(await compactState(c, mergeOf(later), laterIds, generation)).toBe('ok');
    const stale = mergeState(early.base, [later.rows[0].payload])!;
    expect(await compactState(c, stale, [laterIds[0]], generation)).toBe('overlap');
    expect(readMap((await loadDocument(c))!.base)).toEqual({ seed: true, a: 1, b: 2 });

    // Run at once, on overlapping windows: one wins, the other is rolled back with nothing changed.
    await appended(c, testUserId, mapUpdate('c', 3), generation);
    await appended(c, testUserId, mapUpdate('d', 4), generation);
    const both = (await loadDocument(c))!;
    const bothIds = both.rows.map((row) => row.id);
    const results = await Promise.all([
      compactState(c, mergeOf(both), bothIds, generation),
      compactState(c, mergeState(both.base, [both.rows[0].payload])!, [bothIds[0]], generation),
    ]);
    expect([...results].sort()).toEqual(['ok', 'overlap']);
    // Whichever won, base and log together still hold both rows.
    expect(readMap(mergeOf((await loadDocument(c))!))).toEqual({ seed: true, a: 1, b: 2, c: 3, d: 4 });
    await deleteDoc(c);
  });

  it('must not read an old base with a new log: a load waits for a fold in flight, and sees it whole', async () => {
    const c = ctx(ids.consistent);
    const generation = await insertDocument(adminClient, c, mapUpdate('seed', true));
    const folded = await appended(c, testUserId, mapUpdate('a', 1), generation);
    const kept = await appended(c, testUserId, mapUpdate('b', 2), generation);

    // Another relay's compaction, between its base write and its commit.
    await adminClient.query('BEGIN');
    try {
      await adminClient.query('UPDATE yjs_documents SET state = $1 WHERE entity_id = $2', [
        Buffer.from(mergeState(mapUpdate('seed', true), [mapUpdate('a', 1)])!),
        ids.consistent,
      ]);
      await adminClient.query('DELETE FROM yjs_updates WHERE id = $1', [folded]);
      const load = loadDocument(c);
      const settled = await Promise.race([load.then(() => 'read'), sleep(300).then(() => 'waiting')]);
      expect(settled).toBe('waiting');
      await adminClient.query('COMMIT');

      const document = (await load)!;
      expect(readMap(document.base)).toEqual({ seed: true, a: 1 });
      expect(document.rows.map((row) => row.id)).toEqual([kept]);
    } catch (err) {
      await adminClient.query('ROLLBACK');
      throw err;
    }
    await deleteDoc(c);
  });

  it('discardLogRows deletes exactly the rows it was given, in the document it names', async () => {
    const c = ctx(ids.discard);
    const other = ctx(ids.compaction);
    const generation = await insertDocument(adminClient, c, new Uint8Array());
    const otherGeneration = await insertDocument(adminClient, other, new Uint8Array());
    const kept = await appended(c, testUserId, mapUpdate('a', 1), generation);
    // Logged before the relay refused updates Yjs cannot decode: inserted directly, as the append refuses it now.
    const { rows } = await adminClient.query<{ id: string }>(
      'INSERT INTO yjs_updates (entity_type, entity_id, tenant_id, organization_id, user_id, payload) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [c.entityType, c.entityId, c.tenantId, c.organizationId, testUserId, Buffer.from(undecodableUpdate)],
    );
    const bad = Number(rows[0].id);
    const elsewhere = await appended(other, testUserId, mapUpdate('elsewhere', true), otherGeneration);

    // An id of another document's row is ignored: the delete is scoped to the document.
    await discardLogRows(c, [bad, elsewhere]);
    expect((await loadDocument(c))!.rows.map((row) => row.id)).toEqual([kept]);
    expect((await loadDocument(other))!.rows.map((row) => row.id)).toEqual([elsewhere]);
    await deleteDoc(c);
    await deleteDoc(other);
  });

  it('loadDocument is null for a non-existent doc, and deleteDoc is safe on it', async () => {
    const c = ctx(ids.nonexistent);
    expect(await loadDocument(c)).toBeNull();
    expect(await touchDoc(c)).toBe(false);
    await expect(deleteDoc(c)).resolves.toBeUndefined();
  });

  it('rows are invisible to the runtime role without tenant context and from another tenant', async () => {
    const c = ctx(ids.rls);
    const generation = await insertDocument(adminClient, c, mapUpdate('seed', true));
    await appended(c, testUserId, mapUpdate('a', 1), generation);

    // Selected by entity id alone on the relay's own (runtime role) pool, so the RLS policies alone decide what comes back.
    const rowsVisible = async (tenantId: string | null): Promise<[number, number]> => {
      const read = async (conn: DbOrTx): Promise<[number, number]> => {
        const docs = await conn.select({ id: yjsDocumentsTable.entityId }).from(yjsDocumentsTable).where(eq(yjsDocumentsTable.entityId, ids.rls));
        const log = await conn.select({ id: yjsUpdatesTable.id }).from(yjsUpdatesTable).where(eq(yjsUpdatesTable.entityId, ids.rls));
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
