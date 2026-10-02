import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { hierarchy } from 'shared';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { mergeState } from '#/modules/yjs/helpers/yjs-state';
import type { DocKey, DocScope } from '../../constants';
import { loadDocument } from '../../data/storage';

// Seeds rows as the superuser (bypassing RLS) for the relay's integration tests, whose code under test connects as runtime_role.

function quoteIdent(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function seedEntityHierarchy(client: pg.Client, plan: TestEntityHierarchyPlan, tenantId: string, createdBy: string, slugPrefix: string) {
  for (const row of plan.seedChannelRows) {
    // Every ancestor id column is NOT NULL on nested channel tables, so seed all of them, not only the parent.
    const columns = ['id', 'tenant_id', 'entity_type', 'name', 'slug', 'created_by', ...row.ancestorColumns.map((column) => column.columnName)];
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

async function cleanupEntityHierarchy(client: pg.Client, plans: TestEntityHierarchyPlan[]) {
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

/** A tenant and its organization (one per tenant). */
export async function seedOrg(client: pg.Client, tenantId: string, orgId: string, slug: string) {
  await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [tenantId, `Authz ${tenantId}`]);
  await client.query('INSERT INTO organizations (id, tenant_id, slug, name, short_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING', [
    orgId,
    tenantId,
    slug,
    `Authz ${slug}`,
    slug.slice(0, 4),
  ]);
}

export async function seedMembership(
  client: pg.Client,
  tenantId: string,
  orgId: string,
  userId: string,
  role: string = hierarchy.getMostPrivilegedRole('organization'),
) {
  await client.query(
    `INSERT INTO memberships (id, tenant_id, channel_type, channel_id, organization_id, user_id, role, created_by, display_order)
     VALUES ($1, $2, 'organization', $3, $3, $4, $5, $4, 1)
     ON CONFLICT (tenant_id, user_id, channel_id) DO NOTHING`,
    [randomUUID(), tenantId, orgId, userId, role],
  );
}

export async function seedAttachment(client: pg.Client, id: string, tenantId: string, plan: TestEntityHierarchyPlan, createdBy: string) {
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

  await client.query(`INSERT INTO attachments (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`, values);
}

/**
 * Deletes what the seed helpers and the relay wrote in `tenantIds`, and the seeded users. One transaction: the
 * organization-keeps-an-admin check is deferred to commit, when the organizations are gone too.
 */
export async function cleanupSeed(
  client: pg.Client,
  { tenantIds, userIds = [], plans = [] }: { tenantIds: string[]; userIds?: string[]; plans?: TestEntityHierarchyPlan[] },
) {
  await client.query('BEGIN');
  for (const table of ['yjs_updates', 'yjs_documents', 'attachments', 'memberships']) {
    await client.query(`DELETE FROM ${table} WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
  }
  await cleanupEntityHierarchy(client, plans);
  await client.query('DELETE FROM organizations WHERE tenant_id = ANY($1::text[])', [tenantIds]);
  await client.query('COMMIT');
  await client.query('DELETE FROM tenants WHERE id = ANY($1::text[])', [tenantIds]);
  await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
  await client.query('DELETE FROM actors WHERE id = ANY($1::uuid[])', [userIds]);
}

/** A document as the relay stored it: its base with every logged row merged in; null when it holds nothing. */
export async function storedState(doc: DocKey): Promise<Uint8Array | null> {
  const document = await loadDocument(doc);
  return mergeState(
    document?.base ?? null,
    (document?.rows ?? []).map((row) => row.payload),
  );
}

/** Inserts a document row holding `state`, as a seed would, and returns its generation. */
export async function insertDocument(client: pg.Client, scope: DocScope, state: Uint8Array): Promise<string> {
  const { rows } = await client.query<{ generation: string }>(
    `INSERT INTO yjs_documents (entity_type, entity_id, tenant_id, organization_id, state)
     VALUES ($1, $2, $3, $4, $5) RETURNING generation`,
    [scope.entityType, scope.entityId, scope.tenantId, scope.organizationId, Buffer.from(state)],
  );
  return rows[0].generation;
}
