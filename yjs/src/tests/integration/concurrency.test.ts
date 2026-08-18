import pg from 'pg';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { DocContext } from '../../constants';
import { createDoc, deleteState, loadState, saveState } from '../../data/storage';

const DATABASE_URL = testDatabaseUrl;

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
  sequential: '20000000-0000-4000-a000-000000000001',
  merged: '20000000-0000-4000-a000-000000000002',
  race: '20000000-0000-4000-a000-000000000003',
};

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

describe('2.3 State consistency under concurrency', () => {
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

  it('rapid sequential saves preserve data integrity', async () => {
    const c = ctx(ids.sequential);
    await createDoc(c);

    for (let i = 0; i < 10; i++) {
      const current = await loadState(c);
      const doc = new Y.Doc();
      if (current && current.length > 0) Y.applyUpdate(doc, current);
      doc.getMap('data').set(`key-${i}`, `value-${i}`);
      await saveState(c, Y.encodeStateAsUpdate(doc));
    }

    const finalState = await loadState(c);
    expect(finalState).not.toBeNull();

    const verify = new Y.Doc();
    Y.applyUpdate(verify, finalState!);
    const map = verify.getMap('data');

    for (let i = 0; i < 10; i++) {
      expect(map.get(`key-${i}`)).toBe(`value-${i}`);
    }

    await deleteState(c);
  });

  it('concurrent saves with pre-merged state are consistent', async () => {
    const c = ctx(ids.merged);
    await createDoc(c);

    const updates: Uint8Array[] = [];
    for (let i = 0; i < 5; i++) {
      const doc = new Y.Doc();
      doc.getMap('data').set(`key-${i}`, `value-${i}`);
      updates.push(Y.encodeStateAsUpdate(doc));
    }

    // One merge, matching what the relay does in safeMerge.
    const merged = Y.mergeUpdates(updates);
    await saveState(c, merged);

    const loaded = await loadState(c);
    const verify = new Y.Doc();
    Y.applyUpdate(verify, loaded!);
    const map = verify.getMap('data');

    for (let i = 0; i < 5; i++) {
      expect(map.get(`key-${i}`)).toBe(`value-${i}`);
    }

    await deleteState(c);
  });

  it('concurrent raw saves demonstrate last-write-wins risk', async () => {
    const c = ctx(ids.race);
    await createDoc(c);

    const seed = new Y.Doc();
    seed.getMap('data').set('initial', true);
    await saveState(c, Y.encodeStateAsUpdate(seed));

    const [stateA, stateB] = await Promise.all([loadState(c), loadState(c)]);

    const docA = new Y.Doc();
    Y.applyUpdate(docA, stateA!);
    docA.getMap('data').set('fromA', true);

    const docB = new Y.Doc();
    Y.applyUpdate(docB, stateB!);
    docB.getMap('data').set('fromB', true);

    // Concurrent saves: last write wins, so one update may be lost.
    await Promise.all([saveState(c, Y.encodeStateAsUpdate(docA)), saveState(c, Y.encodeStateAsUpdate(docB))]);

    const final = await loadState(c);
    const verify = new Y.Doc();
    Y.applyUpdate(verify, final!);
    const map = verify.getMap('data');

    const hasA = map.get('fromA') === true;
    const hasB = map.get('fromB') === true;
    expect(hasA || hasB).toBe(true);

    // Without merging one concurrent update is typically lost; the relay's debounce plus safeMerge covers this in production, which this test does not exercise.
    if (!hasA || !hasB) {
      console.info('  ℹ Last-write-wins confirmed: one concurrent update was lost (expected without merge)');
    }

    await deleteState(c);
  });
});
