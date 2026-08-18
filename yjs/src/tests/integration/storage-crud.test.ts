import pg from 'pg';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { DocContext } from '../../constants';
import { createDoc, deleteState, loadState, saveState } from '../../data/storage';

const DATABASE_URL = testDatabaseUrl;

// A dedicated tenant/user so parallel tests do not collide.
const testTenantId = 'yjs-integ-tenant';
const testUserId = 'yjs-integ-user';
const testOrgId = '00000000-0000-4000-a000-000000000001';

function ctx(entityId: string): DocContext {
  return {
    // yjs_documents has no FK to the entity table, so any product type works.
    entityType: appConfig.productEntityTypes[0],
    entityId,
    tenantId: testTenantId,
    userId: testUserId,
    organizationId: testOrgId,
    verified: true,
  };
}

const ids = {
  lifecycle: '10000000-0000-4000-a000-000000000001',
  idempotent: '10000000-0000-4000-a000-000000000002',
  overwrite: '10000000-0000-4000-a000-000000000003',
  nonexistent: '10000000-0000-4000-a000-000000000004',
  deleteNoop: '10000000-0000-4000-a000-000000000005',
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
  await client.query('DELETE FROM yjs_documents WHERE tenant_id = $1', [testTenantId]);
  await client.query('DELETE FROM organizations WHERE tenant_id = $1', [testTenantId]);
  await client.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
}

describe('6.1 Storage CRUD', () => {
  let adminClient: pg.Client;

  beforeAll(async () => {
    adminClient = new pg.Client({ connectionString: DATABASE_URL });
    await adminClient.connect();
    await seedTestTenant(adminClient);
  });

  afterAll(async () => {
    await cleanupTestData(adminClient);
    await adminClient.end();
  });

  it('full create → load → save → load → delete lifecycle', async () => {
    const c = ctx(ids.lifecycle);

    await createDoc(c);

    const empty = await loadState(c);
    expect(empty).not.toBeNull();
    expect(empty!.length).toBe(0);

    const doc = new Y.Doc();
    doc.getMap('test').set('hello', 'world');
    const update = Y.encodeStateAsUpdate(doc);
    await saveState(c, update);

    const loaded = await loadState(c);
    expect(loaded).not.toBeNull();
    expect(loaded!.length).toBeGreaterThan(0);

    const verify = new Y.Doc();
    Y.applyUpdate(verify, loaded!);
    expect(verify.getMap('test').get('hello')).toBe('world');

    await deleteState(c);

    const deleted = await loadState(c);
    expect(deleted).toBeNull();
  });

  it('createDoc is idempotent (ON CONFLICT DO NOTHING)', async () => {
    const c = ctx(ids.idempotent);

    await createDoc(c);
    await createDoc(c); // should not throw

    const state = await loadState(c);
    expect(state).not.toBeNull();

    await deleteState(c);
  });

  it('saveState overwrites existing state (last write wins)', async () => {
    const c = ctx(ids.overwrite);

    await createDoc(c);

    const doc1 = new Y.Doc();
    doc1.getMap('v').set('version', 1);
    await saveState(c, Y.encodeStateAsUpdate(doc1));

    const doc2 = new Y.Doc();
    doc2.getMap('v').set('version', 2);
    await saveState(c, Y.encodeStateAsUpdate(doc2));

    const loaded = await loadState(c);
    const verify = new Y.Doc();
    Y.applyUpdate(verify, loaded!);
    expect(verify.getMap('v').get('version')).toBe(2);

    await deleteState(c);
  });

  it('loadState returns null for non-existent doc', async () => {
    const c = ctx(ids.nonexistent);
    const state = await loadState(c);
    expect(state).toBeNull();
  });

  it('deleteState is safe on non-existent doc', async () => {
    const c = ctx(ids.deleteNoop);
    await deleteState(c);
  });
});
