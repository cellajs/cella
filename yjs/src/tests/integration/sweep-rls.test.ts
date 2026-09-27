import pg from 'pg';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteDoc, listStaleDocs } from '../../data/storage';

const DATABASE_URL = testDatabaseUrl;
const entityType = appConfig.productEntityTypes[0];

// Two tenants, so the sweep must cross a tenant boundary the RLS policy would otherwise hide.
const tenants = { a: 'yjs-sweep-tenant-a', b: 'yjs-sweep-tenant-b' };
const orgs = { a: '00000000-0000-4000-a000-000000000021', b: '00000000-0000-4000-a000-000000000022' };
const docs = {
  /** Unstamped for a day, with a log row as old: the log a crash left unwritten. */
  staleA: '30000000-0000-4000-a000-000000000001',
  staleB: '30000000-0000-4000-a000-000000000002',
  /** Stamped just now, with an old log row: a live session that has not compacted yet. */
  freshA: '30000000-0000-4000-a000-000000000003',
  /** Old session row, but a log row younger than the grace period: a live session on another relay generation. */
  liveLogA: '30000000-0000-4000-a000-000000000004',
  /** Unstamped for a day with nothing logged: a document at rest, its base outliving its sessions. */
  idleA: '30000000-0000-4000-a000-000000000005',
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
  const log = (entityId: string, tenantId: string, organizationId: string, age: string) =>
    client.query(
      `INSERT INTO yjs_updates (entity_type, entity_id, tenant_id, organization_id, payload, created_at)
       VALUES ($1, $2, $3, $4, '\\x00', now() - $5::interval)`,
      [entityType, entityId, tenantId, organizationId, age],
    );
  await insert(docs.staleA, tenants.a, orgs.a, '1 day');
  await log(docs.staleA, tenants.a, orgs.a, '1 day');
  await insert(docs.staleB, tenants.b, orgs.b, '1 day');
  await log(docs.staleB, tenants.b, orgs.b, '1 day');
  await insert(docs.freshA, tenants.a, orgs.a, '0 seconds');
  await log(docs.freshA, tenants.a, orgs.a, '1 day');
  await insert(docs.liveLogA, tenants.a, orgs.a, '1 day');
  await log(docs.liveLogA, tenants.a, orgs.a, '0 seconds');
  await insert(docs.idleA, tenants.a, orgs.a, '1 day');
}

async function cleanup(client: pg.Client) {
  const ids = Object.values(tenants);
  await client.query('DELETE FROM yjs_updates WHERE tenant_id = ANY($1)', [ids]);
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

  it('lists documents with an unwritten log from every tenant through tenant-scoped reads, skipping stamped rows, live logs and rows with nothing logged', async () => {
    const stale = await listStaleDocs(60_000);
    const ours = stale.filter((doc) => Object.values(tenants).includes(doc.tenantId));
    expect(ours.map((doc) => doc.entityId).sort()).toEqual([docs.staleA, docs.staleB].sort());
    expect(ours.find((doc) => doc.entityId === docs.staleB)?.organizationId).toBe(orgs.b);
  });

  it('deletes a swept document inside its own tenant scope', async () => {
    await deleteDoc({ entityType, entityId: docs.staleA, tenantId: tenants.a });
    const { rowCount } = await admin.query('SELECT 1 FROM yjs_documents WHERE entity_id = $1', [docs.staleA]);
    expect(rowCount).toBe(0);
    // The other tenant's row is untouched.
    const other = await admin.query('SELECT 1 FROM yjs_documents WHERE entity_id = $1', [docs.staleB]);
    expect(other.rowCount).toBe(1);
  });
});
