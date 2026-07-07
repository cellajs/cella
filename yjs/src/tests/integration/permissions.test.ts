import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { testDatabaseUrl } from 'shared/test-db';
import type { DocContext } from '../../constants';
import { canEditEntity } from '../../data/permissions';

const DATABASE_URL = testDatabaseUrl;

const tenantA = 'yjs-authz-tenant-a';
const tenantB = 'yjs-authz-tenant-b';

const orgA = '20000000-0000-4000-a000-000000000001';
const orgB = '20000000-0000-4000-a000-000000000002';
const orgC = '20000000-0000-4000-a000-000000000003';

const userA = randomUUID();
const userB = randomUUID();

const attachmentA = randomUUID(); // tenantA / orgA, owned by userA
const attachmentB = randomUUID(); // tenantA / orgB, no membership for userA
const attachmentC = randomUUID(); // tenantB / orgC

const hierarchyA = buildTestEntityHierarchyPlan({
  entityType: 'attachment',
  rootContextId: orgA,
  makeContextId: () => randomUUID(),
});
const hierarchyB = buildTestEntityHierarchyPlan({
  entityType: 'attachment',
  rootContextId: orgB,
  makeContextId: () => randomUUID(),
});
const hierarchyC = buildTestEntityHierarchyPlan({
  entityType: 'attachment',
  rootContextId: orgC,
  makeContextId: () => randomUUID(),
});

function ctx(overrides: Partial<DocContext>): DocContext {
  return {
    entityType: 'attachment',
    entityId: attachmentA,
    tenantId: tenantA,
    userId: userA,
    organizationId: orgA,
    verified: false,
    ...overrides,
  };
}

function quoteIdent(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function seedEntityHierarchy(
  client: pg.Client,
  plan: TestEntityHierarchyPlan,
  tenantId: string,
  createdBy: string,
  slugPrefix: string,
) {
  for (const row of plan.seedContextRows) {
    const columns = ['id', 'tenant_id', 'entity_type', 'name', 'slug', 'created_by', row.parentColumnName];
    const values = [
      row.id,
      tenantId,
      row.contextType,
      `Authz ${row.contextType}`,
      `${slugPrefix}-${row.contextType}-${row.id.slice(0, 8)}`,
      createdBy,
      row.parentId,
    ];
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    await client.query(
      `INSERT INTO ${quoteIdent(row.tableName)} (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
      values,
    );
  }
}

async function cleanupEntityHierarchy(client: pg.Client, plans: TestEntityHierarchyPlan[]) {
  for (const row of plans.flatMap((plan) => plan.seedContextRows).reverse()) {
    await client.query(`DELETE FROM ${quoteIdent(row.tableName)} WHERE id = $1`, [row.id]);
  }
}

async function seedUser(client: pg.Client, id: string, suffix: string) {
  await client.query(`INSERT INTO users (id, name, slug, email) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`, [
    id,
    `YJS Authz ${suffix}`,
    `yjs-authz-${suffix}-${id.slice(0, 8)}`,
    `yjs-authz-${suffix}-${id.slice(0, 8)}@example.com`,
  ]);
}

async function seedTenant(client: pg.Client, tenantId: string) {
  await client.query(`INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [tenantId, `Authz ${tenantId}`]);
}

async function seedOrg(client: pg.Client, tenantId: string, orgId: string, slug: string) {
  await client.query(
    `INSERT INTO organizations (id, tenant_id, slug, name, short_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
    [orgId, tenantId, slug, `Authz ${slug}`, slug.slice(0, 4)],
  );
}

async function seedMembership(client: pg.Client, tenantId: string, orgId: string, userId: string) {
  await client.query(
    `INSERT INTO memberships (id, tenant_id, context_type, context_id, organization_id, user_id, role, created_by, display_order)
     VALUES ($1, $2, 'organization', $3, $3, $4, 'admin', $4, 1)
     ON CONFLICT (tenant_id, user_id, context_id) DO NOTHING`,
    [randomUUID(), tenantId, orgId, userId],
  );
}

async function seedAttachment(
  client: pg.Client,
  id: string,
  tenantId: string,
  plan: TestEntityHierarchyPlan,
  createdBy: string,
) {
  const columns = [
    'id',
    'tenant_id',
    'created_by',
    ...plan.sqlContextColumns.map(({ columnName }) => columnName),
    'bucket_name',
    'filename',
    'content_type',
    'size',
    'original_key',
    'stx',
  ];
  const values = [
    id,
    tenantId,
    createdBy,
    ...plan.sqlContextColumns.map(({ id: contextId }) => contextId),
    'authz-bucket',
    'authz.pdf',
    'application/pdf',
    '1024',
    `authz/${id}.pdf`,
    JSON.stringify({ mutationId: id, sourceId: 'test', fieldTimestamps: {} }),
  ];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  await client.query(
    `INSERT INTO attachments (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
    values,
  );
}

// Exercises the real `loadMemberships` / `resolveEntityScope` SQL and the shared permission engine
// against Postgres, covering cross-tenant and cross-organization isolation.
describe('Local entity authorization (canEditEntity)', () => {
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DATABASE_URL });
    await admin.connect();

    await seedUser(admin, userA, 'a');
    await seedUser(admin, userB, 'b');

    await seedTenant(admin, tenantA);
    await seedTenant(admin, tenantB);

    await seedOrg(admin, tenantA, orgA, 'authz-a');
    await seedOrg(admin, tenantA, orgB, 'authz-b');
    await seedOrg(admin, tenantB, orgC, 'authz-c');

    await seedEntityHierarchy(admin, hierarchyA, tenantA, userA, 'authz-a');
    await seedEntityHierarchy(admin, hierarchyB, tenantA, userA, 'authz-b');
    await seedEntityHierarchy(admin, hierarchyC, tenantB, userB, 'authz-c');

    await seedMembership(admin, tenantA, orgA, userA);
    await seedMembership(admin, tenantB, orgC, userB);

    await seedAttachment(admin, attachmentA, tenantA, hierarchyA, userA);
    await seedAttachment(admin, attachmentB, tenantA, hierarchyB, userA);
    await seedAttachment(admin, attachmentC, tenantB, hierarchyC, userB);
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM attachments WHERE id = ANY($1::uuid[])`, [[attachmentA, attachmentB, attachmentC]]);
    await admin.query(`DELETE FROM memberships WHERE user_id = ANY($1::uuid[])`, [[userA, userB]]);
    await cleanupEntityHierarchy(admin, [hierarchyA, hierarchyB, hierarchyC]);
    await admin.query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [[orgA, orgB, orgC]]);
    await admin.query(`DELETE FROM tenants WHERE id = ANY($1::text[])`, [[tenantA, tenantB]]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userA, userB]]);
    await admin.end();
  });

  it('allows an org admin to edit an entity in their organization', async () => {
    await expect(canEditEntity(ctx({ entityId: attachmentA }))).resolves.toBe(true);
  });

  it('denies editing an entity in a different organization within the same tenant', async () => {
    await expect(canEditEntity(ctx({ entityId: attachmentB, organizationId: orgB }))).resolves.toBe(false);
  });

  it('denies editing an entity in a tenant where the user has no membership', async () => {
    await expect(
      canEditEntity(ctx({ entityId: attachmentC, tenantId: tenantB, organizationId: orgC })),
    ).resolves.toBe(false);
  });

  it('denies when the tenant param does not match the entity tenant (defense-in-depth)', async () => {
    await expect(canEditEntity(ctx({ entityId: attachmentA, tenantId: tenantB, organizationId: orgA }))).resolves.toBe(false);
  });

  it('denies access to a non-existent entity', async () => {
    await expect(canEditEntity(ctx({ entityId: randomUUID() }))).resolves.toBe(false);
  });
});
