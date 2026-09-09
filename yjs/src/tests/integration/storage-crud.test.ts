import pg from 'pg';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DocContext } from '../../constants';
import { appendUpdate, compactState, deleteDoc, ensureDoc, loadBase, readLog } from '../../data/storage';
import { mergeState } from '../../sync/document-state';
import { mapUpdate, readMap } from '../helpers';

const DATABASE_URL = testDatabaseUrl;

// A dedicated tenant/user so parallel tests do not collide.
const testTenantId = 'yjs-integ-tenant';
const testUserId = '00000000-0000-4000-a000-0000000000aa';
const testOrgId = '00000000-0000-4000-a000-000000000001';

function ctx(entityId: string, userId = testUserId): DocContext {
  return {
    // The Yjs tables have no FK to the entity table, so any product type works.
    entityType: appConfig.productEntityTypes[0],
    entityId,
    tenantId: testTenantId,
    userId,
    organizationId: testOrgId,
    verified: true,
  };
}

const ids = {
  lifecycle: '10000000-0000-4000-a000-000000000001',
  idempotent: '10000000-0000-4000-a000-000000000002',
  compaction: '10000000-0000-4000-a000-000000000003',
  nonexistent: '10000000-0000-4000-a000-000000000004',
  rls: '10000000-0000-4000-a000-000000000005',
};

/** Seeds the rows the RLS context needs so `set_config` does not trigger FK violations; runs as the superuser, which bypasses RLS. */
async function seedTestTenant(client: pg.Client) {
  await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [
    testTenantId,
    'YJS Integration Test Tenant',
  ]);
  await client.query(
    'INSERT INTO organizations (id, tenant_id, slug, name, short_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
    [testOrgId, testTenantId, 'yjs-integ-org', 'YJS Test Org', 'yto'],
  );
}

async function cleanupTestData(client: pg.Client) {
  await client.query('DELETE FROM yjs_updates WHERE tenant_id = $1', [testTenantId]);
  await client.query('DELETE FROM yjs_documents WHERE tenant_id = $1', [testTenantId]);
  await client.query('DELETE FROM organizations WHERE tenant_id = $1', [testTenantId]);
  await client.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
}

describe('6.1 Storage: session row, update log, compaction', () => {
  let adminClient: pg.Client;

  beforeAll(async () => {
    adminClient = new pg.Client({ connectionString: DATABASE_URL });
    await adminClient.connect();
    await cleanupTestData(adminClient);
    await seedTestTenant(adminClient);
  });

  afterAll(async () => {
    await cleanupTestData(adminClient);
    await adminClient.end();
  });

  it('ensure → append → read → compact → delete lifecycle', async () => {
    const c = ctx(ids.lifecycle);
    const seed = mapUpdate('seed', true);
    expect(await loadBase(c)).toBeNull();
    expect(await ensureDoc(c, seed)).toEqual(seed);

    await appendUpdate(c, mapUpdate('a', 1));
    await appendUpdate(ctx(ids.lifecycle, '00000000-0000-4000-a000-0000000000bb'), mapUpdate('b', 2));
    const rows = await readLog(c);
    expect(rows.map((row) => row.userId)).toEqual([testUserId, '00000000-0000-4000-a000-0000000000bb']);
    expect(rows[0].id).toBeLessThan(rows[1].id);

    const merged = mergeState(
      await loadBase(c),
      rows.map((row) => row.payload),
    )!;
    await compactState(
      c,
      merged,
      rows.map((row) => row.id),
    );
    expect(readMap((await loadBase(c))!)).toEqual({ seed: true, a: 1, b: 2 });
    expect(await readLog(c)).toEqual([]);

    await deleteDoc(c);
    expect(await loadBase(c)).toBeNull();
  });

  it('ensureDoc keeps the first seed and returns it to a concurrent second connector', async () => {
    const c = ctx(ids.idempotent);
    const first = mapUpdate('first', true);
    const [a, b] = await Promise.all([ensureDoc(c, first), ensureDoc(c, mapUpdate('second', true))]);
    expect(readMap(a)).toEqual({ first: true });
    expect(readMap(b)).toEqual({ first: true });
    expect(readMap(await ensureDoc(c, null))).toEqual({ first: true });
    await deleteDoc(c);
  });

  it('twenty concurrent appends all land, and compaction deletes only the rows it was given', async () => {
    const c = ctx(ids.compaction);
    await ensureDoc(c, null);
    await Promise.all(Array.from({ length: 20 }, (_, i) => appendUpdate(c, mapUpdate(`k${i}`, i))));
    const rows = await readLog(c);
    expect(rows).toHaveLength(20);

    // An append that lands after the read and before the compaction write survives.
    const read = rows.slice(0, 20);
    await appendUpdate(c, mapUpdate('late', true));
    const merged = mergeState(
      await loadBase(c),
      read.map((row) => row.payload),
    )!;
    await compactState(
      c,
      merged,
      read.map((row) => row.id),
    );

    const remaining = await readLog(c);
    expect(remaining).toHaveLength(1);
    expect(readMap(remaining[0].payload)).toEqual({ late: true });
    const base = readMap((await loadBase(c))!);
    expect(Object.keys(base)).toHaveLength(20);
    await deleteDoc(c);
  });

  it('loadBase and readLog are empty for a non-existent doc, and deleteDoc is safe on it', async () => {
    const c = ctx(ids.nonexistent);
    expect(await loadBase(c)).toBeNull();
    expect(await readLog(c)).toEqual([]);
    await expect(deleteDoc(c)).resolves.toBeUndefined();
  });

  it('rows are invisible to the runtime role without tenant context and from another tenant', async () => {
    const c = ctx(ids.rls);
    await ensureDoc(c, mapUpdate('seed', true));
    await appendUpdate(c, mapUpdate('a', 1));

    expect(await loadBase({ ...c, tenantId: 'some-other-tenant' })).toBeNull();
    expect(await readLog({ ...c, tenantId: 'some-other-tenant' })).toEqual([]);
    // Superuser sees both tables' rows.
    const docs = await adminClient.query('SELECT 1 FROM yjs_documents WHERE entity_id = $1', [ids.rls]);
    const log = await adminClient.query('SELECT 1 FROM yjs_updates WHERE entity_id = $1', [ids.rls]);
    expect(docs.rowCount).toBe(1);
    expect(log.rowCount).toBe(1);
    await deleteDoc(c);
  });
});
