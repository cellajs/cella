import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { appConfig } from 'shared';
import * as Y from 'yjs';
import { createDoc, loadState, saveState, deleteState } from '../../data/storage';
import type { DocContext } from '../../constants';
import { testDatabaseUrl } from 'shared/test-db';

const DATABASE_URL = testDatabaseUrl;

// Use a known tenant/user that won't conflict with other tests
const testTenantId = 'yjs-integ-tenant';
const testUserId = 'yjs-integ-user';
const testOrgId = '00000000-0000-4000-a000-000000000001';

function ctx(entityId: string): DocContext {
  return {
    // Config-derived: yjs_documents has no FK to the entity table, so any product type works.
    entityType: appConfig.productEntityTypes[0],
    entityId,
    tenantId: testTenantId,
    userId: testUserId,
    organizationId: testOrgId,
    verified: true,
  };
}

// Deterministic UUIDs for each test case
const ids = {
  lifecycle: '10000000-0000-4000-a000-000000000001',
  idempotent: '10000000-0000-4000-a000-000000000002',
  overwrite: '10000000-0000-4000-a000-000000000003',
  nonexistent: '10000000-0000-4000-a000-000000000004',
  deleteNoop: '10000000-0000-4000-a000-000000000005',
};

/**
 * Seed minimal rows so RLS context (`set_config`) doesn't cause FK violations.
 * Uses the postgres superuser which bypasses RLS.
 */
async function seedTestTenant(client: pg.Client) {
  // Ensure tenant exists (idempotent)
  await client.query(
    `INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
    [testTenantId, 'YJS Integration Test Tenant'],
  );
  // Ensure organization exists
  await client.query(
    `INSERT INTO organizations (id, tenant_id, slug, name, short_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
    [testOrgId, testTenantId, 'yjs-integ-org', 'YJS Test Org', 'yto'],
  );
}

/** Remove all test data. */
async function cleanupTestData(client: pg.Client) {
  await client.query(`DELETE FROM yjs_documents WHERE tenant_id = $1`, [testTenantId]);
  await client.query(`DELETE FROM organizations WHERE tenant_id = $1`, [testTenantId]);
  await client.query(`DELETE FROM tenants WHERE id = $1`, [testTenantId]);
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

    // Create
    await createDoc(c);

    // Load: row exists with empty state
    const empty = await loadState(c);
    expect(empty).not.toBeNull();
    expect(empty!.length).toBe(0);

    // Save real Y.Doc state
    const doc = new Y.Doc();
    doc.getMap('test').set('hello', 'world');
    const update = Y.encodeStateAsUpdate(doc);
    await saveState(c, update);

    // Load: should return saved state
    const loaded = await loadState(c);
    expect(loaded).not.toBeNull();
    expect(loaded!.length).toBeGreaterThan(0);

    // Verify round-trip fidelity
    const verify = new Y.Doc();
    Y.applyUpdate(verify, loaded!);
    expect(verify.getMap('test').get('hello')).toBe('world');

    // Delete
    await deleteState(c);

    // Load: should return null (no row)
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
    // Should not throw
    await deleteState(c);
  });
});
