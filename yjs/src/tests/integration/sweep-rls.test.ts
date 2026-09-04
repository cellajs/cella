import pg from 'pg';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteStaleDoc, listStaleDocs } from '../../data/storage';

const DATABASE_URL = testDatabaseUrl;
const entityType = appConfig.productEntityTypes[0];

// Two tenants, so the sweep must cross a tenant boundary the RLS policy would otherwise hide.
const tenants = { a: 'yjs-sweep-tenant-a', b: 'yjs-sweep-tenant-b' };
const orgs = { a: '00000000-0000-4000-a000-000000000021', b: '00000000-0000-4000-a000-000000000022' };
const docs = {
  staleA: '30000000-0000-4000-a000-000000000001',
  staleB: '30000000-0000-4000-a000-000000000002',
  freshA: '30000000-0000-4000-a000-000000000003',
};

/** Seeds as the superuser (bypasses RLS); the functions under test connect as runtime_role. */
async function seed(client: pg.Client) {
  for (const [key, tenantId] of Object.entries(tenants) as ['a' | 'b', string][]) {
    await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [
      tenantId,
      `YJS Sweep Tenant ${key}`,
    ]);
    await client.query(
      'INSERT INTO organizations (id, tenant_id, slug, name, short_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
      [orgs[key], tenantId, `yjs-sweep-org-${key}`, `YJS Sweep Org ${key}`, `ys${key}`],
    );
  }
  const insert = (entityId: string, tenantId: string, organizationId: string, age: string) =>
    client.query(
      `INSERT INTO yjs_documents (entity_type, entity_id, tenant_id, organization_id, state, updated_at)
       VALUES ($1, $2, $3, $4, '\\x00', now() - $5::interval) ON CONFLICT DO NOTHING`,
      [entityType, entityId, tenantId, organizationId, age],
    );
  await insert(docs.staleA, tenants.a, orgs.a, '1 day');
  await insert(docs.staleB, tenants.b, orgs.b, '1 day');
  await insert(docs.freshA, tenants.a, orgs.a, '0 seconds');
}

async function cleanup(client: pg.Client) {
  const ids = Object.values(tenants);
  await client.query('DELETE FROM yjs_documents WHERE tenant_id = ANY($1)', [ids]);
  await client.query('DELETE FROM organizations WHERE tenant_id = ANY($1)', [ids]);
  await client.query('DELETE FROM tenants WHERE id = ANY($1)', [ids]);
}

describe('startup sweep under RLS (runtime_role)', () => {
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DATABASE_URL });
    await admin.connect();
    await cleanup(admin);
    await seed(admin);
  });

  afterAll(async () => {
    await cleanup(admin);
    await admin.end();
  });

  it('lists stale rows from every tenant through tenant-scoped reads, skipping fresh ones', async () => {
    const stale = await listStaleDocs(60_000);
    const ours = stale.filter((doc) => Object.values(tenants).includes(doc.tenantId));
    expect(ours.map((doc) => doc.entityId).sort()).toEqual([docs.staleA, docs.staleB].sort());
    expect(ours.find((doc) => doc.entityId === docs.staleB)?.organizationId).toBe(orgs.b);
  });

  it('deletes a swept row inside its own tenant scope', async () => {
    await deleteStaleDoc({ entityType, entityId: docs.staleA, tenantId: tenants.a });
    const { rowCount } = await admin.query('SELECT 1 FROM yjs_documents WHERE entity_id = $1', [docs.staleA]);
    expect(rowCount).toBe(0);
    // The other tenant's row is untouched.
    const other = await admin.query('SELECT 1 FROM yjs_documents WHERE entity_id = $1', [docs.staleB]);
    expect(other.rowCount).toBe(1);
  });
});
