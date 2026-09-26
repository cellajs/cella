import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';

// Seeds rows as the superuser (bypassing RLS) for the relay's integration tests, whose code under test connects as runtime_role.

function quoteIdent(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function seedEntityHierarchy(
  client: pg.Client,
  plan: TestEntityHierarchyPlan,
  tenantId: string,
  createdBy: string,
  slugPrefix: string,
) {
  for (const row of plan.seedChannelRows) {
    // Every ancestor id column is NOT NULL on nested channel tables, so seed all of them, not only the parent.
    const columns = [
      'id',
      'tenant_id',
      'entity_type',
      'name',
      'slug',
      'created_by',
      ...row.ancestorColumns.map((column) => column.columnName),
    ];
    const values = [
      row.id,
      tenantId,
      row.channelType,
      `Authz ${row.channelType}`,
      `${slugPrefix}-${row.channelType}-${row.id.slice(0, 8)}`,
      createdBy,
      ...row.ancestorColumns.map((column) => column.id),
    ];
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    await client.query(
      `INSERT INTO ${quoteIdent(row.tableName)} (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
      values,
    );
  }
}

export async function cleanupEntityHierarchy(client: pg.Client, plans: TestEntityHierarchyPlan[]) {
  for (const row of plans.flatMap((plan) => plan.seedChannelRows).reverse()) {
    await client.query(`DELETE FROM ${quoteIdent(row.tableName)} WHERE id = $1`, [row.id]);
  }
}

export async function seedUser(client: pg.Client, id: string, suffix: string) {
  // users.id is a foreign key to actors.id, so the actor row comes first
  await client.query("INSERT INTO actors (id, kind) VALUES ($1, 'user') ON CONFLICT (id) DO NOTHING", [id]);
  await client.query('INSERT INTO users (id, name, slug, email) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING', [
    id,
    `YJS Authz ${suffix}`,
    `yjs-authz-${suffix}-${id.slice(0, 8)}`,
    `yjs-authz-${suffix}-${id.slice(0, 8)}@example.com`,
  ]);
}

export async function seedTenant(client: pg.Client, tenantId: string) {
  await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [
    tenantId,
    `Authz ${tenantId}`,
  ]);
}

export async function seedOrg(client: pg.Client, tenantId: string, orgId: string, slug: string) {
  await client.query(
    'INSERT INTO organizations (id, tenant_id, slug, name, short_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
    [orgId, tenantId, slug, `Authz ${slug}`, slug.slice(0, 4)],
  );
}

export async function seedMembership(
  client: pg.Client,
  tenantId: string,
  orgId: string,
  userId: string,
  role = 'admin',
) {
  await client.query(
    `INSERT INTO memberships (id, tenant_id, channel_type, channel_id, organization_id, user_id, role, created_by, display_order)
     VALUES ($1, $2, 'organization', $3, $3, $4, $5, $4, 1)
     ON CONFLICT (tenant_id, user_id, channel_id) DO NOTHING`,
    [randomUUID(), tenantId, orgId, userId, role],
  );
}

export async function seedAttachment(
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
    ...plan.sqlChannelColumns.map(({ columnName }) => columnName),
    'bucket_name',
    'filename',
    'content_type',
    'size',
    'keys',
    'stx',
  ];
  const values = [
    id,
    tenantId,
    createdBy,
    ...plan.sqlChannelColumns.map(({ id: channelId }) => channelId),
    'authz-bucket',
    'authz.pdf',
    'application/pdf',
    '1024',
    JSON.stringify({ original: `authz/${id}.pdf` }),
    JSON.stringify({ mutationId: id, sourceId: 'test', fieldTimestamps: {} }),
  ];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  await client.query(
    `INSERT INTO attachments (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
    values,
  );
}
