import { randomUUID } from 'node:crypto';
import { eq, getColumns, getTableName, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { appConfig, type ProductEntityType } from 'shared';
import { testAdminRoleDatabaseUrl, testRuntimeDatabaseUrl } from 'shared/test-db';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { nanoidTenant } from 'shared/utils/nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as adminDb, type Tx } from '#/db/db';
import { membershipImmutableColumns } from '#/db/immutability-triggers';
import { buildInsertableProduct } from '#/mocks';
import { seenWindowMs, trackedProductTypes } from '#/modules/seen/operations/mark-seen';
import { findUnseenCountsByUser } from '#/modules/seen/seen-queries';
import { entityTables, getEntityTable } from '#/tables';

/** Local read-only tenant context helper, mirrors tenantRead without importing it. */
async function tenantReadTest<T>(tenantId: string, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return adminDb.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    await tx.execute(sql`
      SELECT set_config('app.tenant_id', ${tenantId}, true),
             set_config('app.user_id', ${userId}, true)
    `);
    return fn(tx);
  });
}

// Deterministic ids so cleanup can target the rows.
const TEST_TENANT_A = 'rlsta1';
const TEST_TENANT_B = 'rlsta2';
/** Org-less tenant: 1 tenant = 1 org, so cross-tenant org-insert tests need a free tenant to aim at. */
const TEST_TENANT_EMPTY = 'rlsta3';
const TEST_USER_A = '00000000-0000-4000-a000-000000000001';
const TEST_USER_B = '00000000-0000-4000-a000-000000000002';
const TEST_ORG_A = '00000000-0000-4000-a000-000000000003';
const TEST_ORG_B = '00000000-0000-4000-a000-000000000004';
const TEST_MEMBERSHIP_A = '00000000-0000-4000-a000-000000000006';
const TEST_MEMBERSHIP_B = '00000000-0000-4000-a000-000000000007';
const TEST_ATTACHMENT_A = '00000000-0000-4000-a000-00000000000e';
const TEST_ACTIVITY_A = 'rls-activity-001';

const RUNTIME_DB_URL = testRuntimeDatabaseUrl;
let runtimeDb: NodePgDatabase;

let rolesAvailable = false;
let requiredTablesAvailable = false;
/** Whether the seen_by table exists (partman-partitioned; may be absent in a minimal test DB). */
let seenByAvailable = false;

const quoteIdent = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

async function seedEntityHierarchy(
  plan: TestEntityHierarchyPlan,
  tenantId: string,
  createdBy: string,
  slugPrefix: string,
) {
  for (const row of plan.seedChannelRows) {
    // Every ancestor id column is NOT NULL on channel tables, so insert all of them.
    const ancestorNames = sql.join(
      row.ancestorColumns.map((column) => sql.raw(quoteIdent(column.columnName))),
      sql`, `,
    );
    const ancestorValues = sql.join(
      row.ancestorColumns.map((column) => sql`${column.id}`),
      sql`, `,
    );
    await adminDb.execute(sql`
      INSERT INTO ${sql.raw(quoteIdent(row.tableName))}
        (id, tenant_id, entity_type, name, slug, created_by, ${ancestorNames})
      VALUES
        (${row.id}, ${tenantId}, ${row.channelType}, ${`RLS ${row.channelType}`}, ${`${slugPrefix}-${row.channelType}-${row.id.slice(0, 8)}`}, ${createdBy}, ${ancestorValues})
      ON CONFLICT (id) DO NOTHING
    `);
  }
}

async function cleanupEntityHierarchy(...plans: TestEntityHierarchyPlan[]) {
  for (const row of plans.flatMap((plan) => plan.seedChannelRows).reverse()) {
    await adminDb.execute(sql`DELETE FROM ${sql.raw(quoteIdent(row.tableName))} WHERE id = ${row.id}`);
  }
}

/** Org-scoped product entities are the RLS-subject tables: tenant SELECT policy + FORCE RLS. */
const rlsProductTypes = appConfig.productEntityTypes;

/**
 * Seed fixture backing one product entity's generic RLS tests. The row comes from the type's
 * registered mock ({@link buildInsertableProduct}); ancestors come from a hierarchy plan.
 */
interface RlsProductFixture {
  entityType: ProductEntityType;
  /** Table name, e.g. 'attachments'. */
  table: string;
  /** Pre-seeded representative row (tenant A / org A) used by update/CDC/unseen tests. */
  rowId: string;
  /** Original name of the representative row, for restore after update tests. */
  rowName: string;
  /** Deepest seeded ancestor, matching findUnseenCountsByUser's COALESCE attribution. */
  homeChannelId: string;
  plan: TestEntityHierarchyPlan;
  insert: (exec: NodePgDatabase | NodePgTx, p: { id: string; tenantId: string; createdBy: string }) => Promise<unknown>;
  /** Seed the representative row as admin/superuser; idempotent. */
  seed: () => Promise<void>;
  cleanup: () => Promise<void>;
}

// Attachment keeps a fixed id so the attachment-specific blocks can target it directly.
const rlsProductRowIds: Partial<Record<ProductEntityType, string>> = { attachment: TEST_ATTACHMENT_A };

const makeRlsProductFixture = (entityType: ProductEntityType): RlsProductFixture => {
  const table = getEntityTable(entityType);
  const rowId = rlsProductRowIds[entityType] ?? randomUUID();
  const rowName = `RLS ${entityType}`;
  const plan = buildTestEntityHierarchyPlan({
    entityType,
    rootChannelId: TEST_ORG_A,
    makeChannelId: () => randomUUID(),
  });
  // Deepest seeded ancestor is where unseen counts roll up (the org itself when org-homed).
  const homeChannelId = plan.sqlChannelColumns[0]?.id ?? TEST_ORG_A;

  const buildRow = (p: { id: string; tenantId: string; createdBy: string }, extra: Record<string, unknown> = {}) =>
    // TS cannot verify a dynamically-built row against the union insert type.
    buildInsertableProduct(entityType, {
      id: p.id,
      tenantId: p.tenantId,
      createdBy: p.createdBy,
      updatedBy: null,
      deletedBy: null,
      ...plan.channelIdColumns,
      // Recent so the unseen-count tests attribute it; the mock's createdAt is a random past date.
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // findUnseenCountsByUser hides unpublished drafts, so publish draft-lifecycle rows.
      ...('publishedAt' in getColumns(table) ? { publishedAt: new Date().toISOString() } : {}),
      seq: 0,
      ...extra,
    }) as never;

  return {
    entityType,
    table: getTableName(table),
    rowId,
    rowName,
    homeChannelId,
    plan,
    insert: async (exec, p) => {
      await exec.insert(table).values(buildRow(p));
    },
    seed: async () => {
      await adminDb
        .insert(table)
        .values(buildRow({ id: rowId, tenantId: TEST_TENANT_A, createdBy: TEST_USER_A }, { name: rowName }))
        .onConflictDoNothing();
    },
    cleanup: async () => {
      await adminDb.delete(table).where(eq(table.id, rowId));
    },
  };
};

/** Fixtures for every configured product entity; table existence is checked in `beforeAll`. */
const iterableRlsProducts = rlsProductTypes.map((t) => [t, makeRlsProductFixture(t)] as const);

/** RLS product fixtures whose table actually exists in the test DB (populated in beforeAll). */
let activeRlsProducts: { type: string; fixture: RlsProductFixture }[] = [];

async function checkRolesExist(): Promise<boolean> {
  const rows = getRows<{ exists: boolean }>(
    await adminDb.execute(
      sql`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') as exists`,
    ),
  );
  return rows[0]?.exists === true;
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = getRows<{ exists: boolean }>(
    await adminDb.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tableName}
      ) AS exists
    `),
  );
  return rows[0]?.exists === true;
}

async function checkRequiredTablesExist(): Promise<boolean> {
  // Base entities present in every Cella app, app-specific product tables are checked per-fixture.
  const requiredTables = ['attachments', 'organizations', 'memberships'];
  const results = await Promise.all(requiredTables.map((tableName) => tableExists(tableName)));
  return results.every(Boolean);
}

/** Create the RLS roles if missing and re-apply FORCE RLS, ownership and grants. Idempotent. */
async function ensureRlsRoles() {
  await adminDb.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime_role') THEN
        CREATE ROLE runtime_role WITH LOGIN PASSWORD 'dev_password';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
        CREATE ROLE admin_role WITH LOGIN BYPASSRLS PASSWORD 'dev_password';
      END IF;
    END $$;
  `);

  await adminDb.execute(sql`GRANT USAGE ON SCHEMA public TO runtime_role`);
  await adminDb.execute(sql`GRANT ALL ON SCHEMA public TO admin_role`);

  // RLS-subject tables (FORCE RLS), org-scoped product entities + yjs_documents.
  const rlsSubjectTables = [
    'yjs_documents',
    ...rlsProductTypes.map((t) => getTableName(entityTables[t as keyof typeof entityTables])),
  ];
  for (const table of rlsSubjectTables) {
    if (!(await tableExists(table))) continue;
    await adminDb.execute(sql.raw(`ALTER TABLE ${table} OWNER TO admin_role`));
    await adminDb.execute(sql.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`));
    await adminDb.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO runtime_role`));
  }

  // Non-RLS channel and seen tables: writes are enforced by application guards, not policies.
  const channelTableNames = appConfig.channelEntityTypes
    .map((type) => entityTables[type as keyof typeof entityTables])
    .filter(Boolean)
    .map((table) => getTableName(table));
  const nonRlsTables = [...channelTableNames, 'memberships', 'inactive_memberships', 'users', 'tenants', 'seen_by'];
  for (const table of nonRlsTables) {
    if (!(await tableExists(table))) continue;
    const priv = table === 'tenants' ? 'SELECT' : 'SELECT, INSERT, UPDATE, DELETE';
    await adminDb.execute(sql.raw(`GRANT ${priv} ON ${table} TO runtime_role`));
  }

  // Admin gets full access; pg_catalog for JSONB operators.
  await adminDb.execute(sql`GRANT ALL ON ALL TABLES IN SCHEMA public TO admin_role`);
  await adminDb.execute(sql`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin_role`);
  await adminDb.execute(sql`GRANT USAGE ON SCHEMA pg_catalog TO runtime_role`);
}

/** Seed via adminDb (superuser) so RLS does not block the inserts. */
async function setupTestData() {
  await adminDb.execute(sql`
    INSERT INTO tenants (id, name, status, created_at, updated_at)
    VALUES
      (${TEST_TENANT_A}, 'RLS Test Tenant A', 'active', NOW(), NOW()),
      (${TEST_TENANT_B}, 'RLS Test Tenant B', 'active', NOW(), NOW()),
      (${TEST_TENANT_EMPTY}, 'RLS Test Tenant Empty', 'active', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await adminDb.execute(sql`
    INSERT INTO users (id, entity_type, name, slug, email, created_at)
    VALUES
      (${TEST_USER_A}, 'user', 'RLS User A', ${`rls-user-a-${Date.now()}`}, ${`rls-a-${Date.now()}@test.com`}, NOW()),
      (${TEST_USER_B}, 'user', 'RLS User B', ${`rls-user-b-${Date.now()}`}, ${`rls-b-${Date.now()}@test.com`}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await adminDb.execute(sql`
    INSERT INTO organizations (id, entity_type, tenant_id, name, slug, created_by, created_at)
    VALUES
      (${TEST_ORG_A}, 'organization', ${TEST_TENANT_A}, 'RLS Org A', ${`rls-org-a-${Date.now()}`}, ${TEST_USER_A}, NOW()),
      (${TEST_ORG_B}, 'organization', ${TEST_TENANT_B}, 'RLS Org B', ${`rls-org-b-${Date.now()}`}, ${TEST_USER_B}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Ancestor hierarchy below the org; a no-op for org-homed products.
  for (const { fixture } of activeRlsProducts) {
    await seedEntityHierarchy(fixture.plan, TEST_TENANT_A, TEST_USER_A, `rls-a-${Date.now()}`);
  }

  await adminDb.execute(sql`
    INSERT INTO memberships (id, tenant_id, channel_type, channel_id, user_id, role, created_by, display_order, organization_id)
    VALUES
      (${TEST_MEMBERSHIP_A}, ${TEST_TENANT_A}, 'organization', ${TEST_ORG_A}, ${TEST_USER_A}, 'admin', ${TEST_USER_A}, 1, ${TEST_ORG_A}),
      (${TEST_MEMBERSHIP_B}, ${TEST_TENANT_B}, 'organization', ${TEST_ORG_B}, ${TEST_USER_B}, 'admin', ${TEST_USER_B}, 1, ${TEST_ORG_B})
    ON CONFLICT (id) DO NOTHING
  `);

  for (const { fixture } of activeRlsProducts) {
    await fixture.seed();
  }

  // Activity row for the append-only trigger test; table_name is a plain varchar with no FK.
  const activityTable = activeRlsProducts[0]?.fixture.table ?? 'attachments';
  await adminDb.execute(sql`
    INSERT INTO activities (id, tenant_id, action, table_name, type, created_at)
    VALUES (${TEST_ACTIVITY_A}, ${TEST_TENANT_A}, 'create', ${activityTable}, 'entity', NOW())
    ON CONFLICT DO NOTHING
  `);
}

/** Reverse creation order, FKs require it. */
async function cleanupTestData() {
  await adminDb.execute(sql`DELETE FROM activities WHERE id = ${TEST_ACTIVITY_A}`);
  for (const { fixture } of activeRlsProducts) {
    await fixture.cleanup();
  }
  await adminDb.execute(sql`DELETE FROM memberships WHERE id IN (${TEST_MEMBERSHIP_A}, ${TEST_MEMBERSHIP_B})`);
  await cleanupEntityHierarchy(...activeRlsProducts.map(({ fixture }) => fixture.plan));
  await adminDb.execute(sql`DELETE FROM organizations WHERE id IN (${TEST_ORG_A}, ${TEST_ORG_B})`);
  await adminDb.execute(sql`DELETE FROM users WHERE id IN (${TEST_USER_A}, ${TEST_USER_B})`);
  await adminDb.execute(
    sql`DELETE FROM tenants WHERE id IN (${TEST_TENANT_A}, ${TEST_TENANT_B}, ${TEST_TENANT_EMPTY})`,
  );
}

/** node-postgres returns QueryResult with .rows; PgAsyncDatabase may return array-like. */
function getRows<T = Record<string, unknown>>(result: any): T[] {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

/** Unwrap DrizzleQueryError to the PG error so trigger/constraint messages can be matched. */
const unwrapDrizzle = <T>(promise: Promise<T>) =>
  promise.catch((err) => {
    throw err.cause ?? err;
  });

/** Transaction type from NodePgDatabase, avoids `as unknown as` for tx ↔ db mismatch. */
type NodePgTx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/** Query as runtime_role with the RLS session variables set. */
async function queryAsRuntimeRole<T = Record<string, unknown>>(
  tenantId: string,
  userId: string,
  queryFn: (tx: NodePgTx) => Promise<unknown>,
): Promise<T[]> {
  return runtimeDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    const result = await queryFn(tx);
    return getRows<T>(result);
  });
}

/** Query as runtime_role with no session context: fail-closed reads must yield zero rows. */
async function queryWithoutChannel<T = Record<string, unknown>>(
  queryFn: (tx: NodePgTx) => Promise<unknown>,
): Promise<T[]> {
  return runtimeDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', '', true)`);
    const result = await queryFn(tx);
    return getRows<T>(result);
  });
}

describe('RLS Security Tests', () => {
  describe('Tenant Context Helpers', () => {
    beforeAll(async () => {
      await adminDb.execute(sql`
        INSERT INTO tenants (id, name, status, created_at, updated_at)
        VALUES
          (${TEST_TENANT_A}, 'RLS Test Tenant A', 'active', NOW(), NOW()),
          (${TEST_TENANT_B}, 'RLS Test Tenant B', 'active', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);
    });

    afterAll(async () => {
      await adminDb.execute(sql`DELETE FROM tenants WHERE id IN (${TEST_TENANT_A}, ${TEST_TENANT_B})`);
    });

    it('should set session variables in tenant context', async () => {
      await tenantReadTest(TEST_TENANT_A, TEST_USER_A, async (tx) => {
        const tenantRows = getRows<{ value: string }>(
          await tx.execute(sql`SELECT current_setting('app.tenant_id', true) as value`),
        );
        const userRows = getRows<{ value: string }>(
          await tx.execute(sql`SELECT current_setting('app.user_id', true) as value`),
        );

        expect(tenantRows[0].value).toBe(TEST_TENANT_A);
        expect(userRows[0].value).toBe(TEST_USER_A);
      });
    });

    it('should clear session variables after transaction', async () => {
      await tenantReadTest(TEST_TENANT_A, TEST_USER_A, async () => {
        // Context is set here
      });

      // set_config with `true` makes variables transaction-scoped, they reset on commit
      const rows = getRows<{ value: string | null }>(
        await adminDb.execute(sql`SELECT current_setting('app.tenant_id', true) as value`),
      );
      const value = rows[0]?.value;
      expect(value === null || value === '').toBe(true);
    });

    it('should set empty tenant in user context', async () => {
      await adminDb.transaction(async (tx) => {
        await tx.execute(sql`
          SELECT set_config('app.tenant_id', '', true),
                 set_config('app.user_id', ${TEST_USER_A}, true)
        `);
        const tenantRows = getRows<{ value: string }>(
          await tx.execute(sql`SELECT current_setting('app.tenant_id', true) as value`),
        );
        const userRows = getRows<{ value: string }>(
          await tx.execute(sql`SELECT current_setting('app.user_id', true) as value`),
        );

        expect(tenantRows[0].value).toBe('');
        expect(userRows[0].value).toBe(TEST_USER_A);
      });
    });

    it('tenantRead should set session variables and read-only transaction', async () => {
      const result = await tenantReadTest(TEST_TENANT_A, TEST_USER_A, async (tx) => {
        const tenantRows = getRows<{ value: string }>(
          await tx.execute(sql`SELECT current_setting('app.tenant_id', true) as value`),
        );
        const userRows = getRows<{ value: string }>(
          await tx.execute(sql`SELECT current_setting('app.user_id', true) as value`),
        );

        expect(tenantRows[0].value).toBe(TEST_TENANT_A);
        expect(userRows[0].value).toBe(TEST_USER_A);

        return 'read-ok';
      });
      expect(result).toBe('read-ok');
    });

    it('tenantRead should reject writes (read-only transaction)', async () => {
      await expect(
        tenantReadTest(TEST_TENANT_A, TEST_USER_A, async (tx) => {
          await tx.execute(sql`
            INSERT INTO tenants (id, name, status, created_at, updated_at)
            VALUES ('rls_read_test', 'Read Test', 'active', NOW(), NOW())
          `);
        }),
      ).rejects.toThrow();
    });
  });

  describe('Tenant Nanoid Generation', () => {
    it('should generate 6-character lowercase alphanumeric IDs', () => {
      const id = nanoidTenant();
      expect(id).toHaveLength(6);
      expect(/^[a-z0-9]+$/.test(id)).toBe(true);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => nanoidTenant()));
      expect(ids.size).toBe(100);
    });
  });
});

// RLS policy verification over the runtime_role connection, which is subject to RLS.

/** Roles + base tables present. Checked at module load so the suite skips on a DB without RLS. */
const rlsSuiteReady = await (async () => {
  try {
    return (await checkRolesExist()) && (await checkRequiredTablesExist());
  } catch {
    return false;
  }
})();

(rlsSuiteReady ? describe : describe.skip)('RLS Policy Verification', () => {
  beforeAll(async () => {
    requiredTablesAvailable = await checkRequiredTablesExist();
    if (!requiredTablesAvailable) {
      console.warn('required RLS tables not available, skipping RLS policy tests');
      return;
    }

    await ensureRlsRoles();
    rolesAvailable = await checkRolesExist();

    if (!rolesAvailable) {
      console.warn('runtime_role not available, skipping RLS policy tests');
      return;
    }

    runtimeDb = drizzle({
      connection: { connectionString: RUNTIME_DB_URL, connectionTimeoutMillis: 5_000 },
    });

    const rows = getRows<{ role: string }>(await runtimeDb.execute(sql`SELECT current_user as role`));
    expect(rows[0].role).toBe('runtime_role');

    activeRlsProducts = [];
    for (const [type, fixture] of iterableRlsProducts) {
      if (await tableExists(fixture.table)) activeRlsProducts.push({ type, fixture });
    }

    await setupTestData();

    // seen_by is partman-partitioned and may be absent in a minimal test DB.
    seenByAvailable = await tableExists('seen_by');
  });

  afterAll(async () => {
    if (!rolesAvailable || !requiredTablesAvailable) return;
    await cleanupTestData();
  });

  // ---- Fail-closed: no context → zero rows ----

  describe('Fail-closed (no context)', () => {
    it('should allow reading organizations without tenant context (no RLS on channel entities)', async () => {
      const rows = await queryWithoutChannel(async (tx) =>
        tx.execute(sql`SELECT id FROM organizations WHERE id IN (${TEST_ORG_A}, ${TEST_ORG_B})`),
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    it('should return zero attachments without tenant context', async () => {
      const rows = await queryWithoutChannel(async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`),
      );
      expect(rows).toHaveLength(0);
    });

    it('should allow reading memberships without context (no RLS on memberships)', async () => {
      // Channel entities and memberships rely on app-layer guards, not RLS policies.
      const rows = await queryWithoutChannel(async (tx) =>
        tx.execute(sql`SELECT id FROM memberships WHERE id IN (${TEST_MEMBERSHIP_A}, ${TEST_MEMBERSHIP_B})`),
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---- Cross-tenant read isolation ----

  describe('Cross-tenant read isolation', () => {
    it('should see all organizations across tenants (no RLS on channel entities)', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`SELECT id FROM organizations WHERE id IN (${TEST_ORG_A}, ${TEST_ORG_B})`),
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(TEST_ORG_A);
      expect(ids).toContain(TEST_ORG_B);
    });

    it('should see the single organization within own tenant', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`SELECT id FROM organizations WHERE tenant_id = ${TEST_TENANT_A}`),
      );
      // 1 tenant = 1 organization, so a tenant lookup yields exactly its own org.
      expect(rows.map((r) => r.id)).toEqual([TEST_ORG_A]);
    });

    it('should read all memberships (no RLS on memberships)', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`SELECT id FROM memberships WHERE id IN (${TEST_MEMBERSHIP_A}, ${TEST_MEMBERSHIP_B})`),
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(TEST_MEMBERSHIP_A);
      expect(ids).toContain(TEST_MEMBERSHIP_B);
    });
  });

  // ---- Cross-tenant write isolation ----

  describe('Cross-tenant write isolation', () => {
    it('should allow inserting organization into any tenant (no RLS on channel entities)', async () => {
      const fakeOrgId = '00000000-0000-4000-a000-000000000301';
      // Guard middleware, not RLS, blocks this at the API layer. Aim at the org-less tenant:
      // Tenant B would trip organizations_tenant_id_key and mask the absent policy.
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
            INSERT INTO organizations (id, entity_type, tenant_id, name, slug, created_by, created_at)
            VALUES (${fakeOrgId}, 'organization', ${TEST_TENANT_EMPTY}, 'Fake Org', ${`rls-fake-${Date.now()}`}, ${TEST_USER_A}, NOW())
          `),
      );
      await adminDb.execute(sql`DELETE FROM organizations WHERE id = ${fakeOrgId}`);
    });

    it('should allow inserting membership into any tenant (no RLS on memberships)', async () => {
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
            INSERT INTO memberships (id, tenant_id, channel_type, channel_id, user_id, role, created_by, display_order, organization_id)
            VALUES ('00000000-0000-4000-a000-000000000303', ${TEST_TENANT_B}, 'organization', ${TEST_ORG_B}, ${TEST_USER_A}, 'member', ${TEST_USER_A}, 99, ${TEST_ORG_B})
          `),
      );
      await adminDb.execute(sql`DELETE FROM memberships WHERE id = '00000000-0000-4000-a000-000000000303'`);
    });

    it('should allow updating organizations in any tenant (no RLS, app-layer isolation)', async () => {
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`UPDATE organizations SET name = 'Updated Cross' WHERE id = ${TEST_ORG_B}`),
      );
      await adminDb.execute(sql`UPDATE organizations SET name = 'RLS Org B' WHERE id = ${TEST_ORG_B}`);
    });
  });

  // ---- Tenant-scoped attachment access (org isolation is app-layer) ----

  describe('Tenant-scoped attachment access', () => {
    it('should deny access to attachments in another tenant', async () => {
      const rows = await queryAsRuntimeRole(TEST_TENANT_B, TEST_USER_B, async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`),
      );
      expect(rows).toHaveLength(0);
    });

    it('should allow access to attachments within own tenant', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(TEST_ATTACHMENT_A);
    });

    it('should deny access to attachments without tenant context', async () => {
      const rows = await queryWithoutChannel(async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`),
      );
      expect(rows).toHaveLength(0);
    });
  });

  // ---- Unseen counts: entity-table read must run with tenant context (getUnseenCounts) ----

  describe('Unseen counts (seen-tracking RLS regression)', () => {
    // FORCE RLS makes context-less base reads return zero, so unseen reads need tenant context.
    type UnseenRow = { channelId: string; productType: string; unseenCount: number };
    const trackedProduct = iterableRlsProducts.find(([type]) =>
      (trackedProductTypes as readonly string[]).includes(type),
    );
    const [trackedType, trackedFixture] = trackedProduct ?? [undefined, undefined];
    const cutoff = () => new Date(Date.now() - seenWindowMs).toISOString();
    const countUnseen = (tx: NodePgTx) =>
      findUnseenCountsByUser({ var: { db: tx } } as Parameters<typeof findUnseenCountsByUser>[0], {
        userId: TEST_USER_A,
        channelIds: [trackedFixture?.homeChannelId ?? TEST_ORG_A],
        productTypes: trackedProductTypes,
        cutoff: cutoff(),
      });

    it('counts in-window unseen entities under tenant context', async () => {
      if (!rolesAvailable || !requiredTablesAvailable || !seenByAvailable || !trackedFixture) return;
      const rows = await queryAsRuntimeRole<UnseenRow>(TEST_TENANT_A, TEST_USER_A, countUnseen);
      const homeRow = rows.find((r) => r.channelId === trackedFixture.homeChannelId);
      expect(homeRow).toBeDefined();
      expect(homeRow?.productType).toBe(trackedType);
      expect(homeRow?.unseenCount).toBe(1);
    });

    it('returns zero without tenant context (RLS regression canary)', async () => {
      if (!rolesAvailable || !requiredTablesAvailable || !seenByAvailable || !trackedFixture) return;
      // Fails if getUnseenCounts drops back to a context-less baseDb read.
      const rows = await queryWithoutChannel<UnseenRow>(countUnseen);
      expect(rows).toHaveLength(0);
    });

    it('drops the count once the entity is marked seen', async () => {
      if (!rolesAvailable || !requiredTablesAvailable || !seenByAvailable || !trackedFixture) return;
      const seenId = '00000000-0000-4000-a000-0000000000a1';
      // `seen_by` is partitioned by `created_at`, so no unique arbiter on `(user_id, product_id)`.
      await adminDb.execute(sql`
        INSERT INTO seen_by (id, user_id, product_id, product_type, channel_id, organization_id, tenant_id, created_at)
        VALUES (${seenId}, ${TEST_USER_A}, ${trackedFixture.rowId}, ${trackedType}, ${trackedFixture.homeChannelId}, ${TEST_ORG_A}, ${TEST_TENANT_A}, NOW())
      `);
      try {
        const rows = await queryAsRuntimeRole<UnseenRow>(TEST_TENANT_A, TEST_USER_A, countUnseen);
        expect(rows.find((r) => r.channelId === trackedFixture.homeChannelId)).toBeUndefined();
      } finally {
        await adminDb.execute(sql`DELETE FROM seen_by WHERE id = ${seenId}`);
      }
    });
  });

  // ---- Unauthenticated write denial ----

  describe('Unauthenticated write denial', () => {
    it('should allow membership insert without authentication (no RLS on memberships)', async () => {
      // TEST_USER_B + TEST_ORG_A avoids a duplicate (tenant_id, user_id, channel_id) with setup data.
      await queryAsRuntimeRole(TEST_TENANT_A, '', async (tx) =>
        tx.execute(sql`
            INSERT INTO memberships (id, tenant_id, channel_type, channel_id, user_id, role, created_by, display_order, organization_id)
            VALUES ('00000000-0000-4000-a000-000000000306', ${TEST_TENANT_A}, 'organization', ${TEST_ORG_A}, ${TEST_USER_B}, 'member', ${TEST_USER_B}, 99, ${TEST_ORG_A})
          `),
      );
      await adminDb.execute(sql`DELETE FROM memberships WHERE id = '00000000-0000-4000-a000-000000000306'`);
    });
  });

  // ---- Write-through on RLS tables (INSERT/UPDATE/DELETE must succeed) ----

  describe('Write-through on RLS tables', () => {
    // Regression guard: FORCE RLS with a SELECT-only policy denies every write.

    describe.each(iterableRlsProducts)('%s', (_type, fixture) => {
      it('should allow INSERT as runtime_role', async () => {
        const id = randomUUID();
        await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
          fixture.insert(tx, { id, tenantId: TEST_TENANT_A, createdBy: TEST_USER_A }),
        );
        await adminDb.execute(sql.raw(`DELETE FROM ${fixture.table} WHERE id = '${id}'`));
      });

      it('should allow UPDATE as runtime_role', async () => {
        await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
          tx.execute(sql.raw(`UPDATE ${fixture.table} SET name = 'Updated Row' WHERE id = '${fixture.rowId}'`)),
        );
        await adminDb.execute(
          sql.raw(`UPDATE ${fixture.table} SET name = '${fixture.rowName}' WHERE id = '${fixture.rowId}'`),
        );
      });

      it('should allow DELETE as runtime_role', async () => {
        const id = randomUUID();
        await fixture.insert(adminDb, { id, tenantId: TEST_TENANT_A, createdBy: TEST_USER_A });
        await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
          tx.execute(sql.raw(`DELETE FROM ${fixture.table} WHERE id = '${id}'`)),
        );
        const rows = getRows(await adminDb.execute(sql.raw(`SELECT id FROM ${fixture.table} WHERE id = '${id}'`)));
        expect(rows).toHaveLength(0);
      });
    });

    it.skipIf(iterableRlsProducts.length === 0)('should allow inserting a yjs_document as runtime_role', async () => {
      const [entityType, fixture] = iterableRlsProducts[0];
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
          INSERT INTO yjs_documents (entity_type, entity_id, tenant_id, organization_id, state)
          VALUES (${entityType}, ${fixture.rowId}, ${TEST_TENANT_A}, ${TEST_ORG_A}, '\\x00')
          ON CONFLICT (entity_type, entity_id) DO NOTHING
        `),
      );
      await adminDb.execute(sql`DELETE FROM yjs_documents WHERE entity_id = ${fixture.rowId}`);
    });

    it.skipIf(iterableRlsProducts.length === 0)(
      'should allow writing without tenant context (write-through is unconditional)',
      async () => {
        const [, fixture] = iterableRlsProducts[0];
        const id = randomUUID();
        // The write-through policy is sql`true`, so no session context is needed.
        await queryWithoutChannel(async (tx) =>
          fixture.insert(tx, { id, tenantId: TEST_TENANT_A, createdBy: TEST_USER_A }),
        );
        const rows = await queryWithoutChannel(async (tx) =>
          tx.execute(sql.raw(`SELECT id FROM ${fixture.table} WHERE id = '${id}'`)),
        );
        expect(rows).toHaveLength(0);
        await adminDb.execute(sql.raw(`DELETE FROM ${fixture.table} WHERE id = '${id}'`));
      },
    );
  });

  // ---- Composite FK violation (tenant_id must match organization's tenant_id) ----

  describe('Composite foreign key enforcement', () => {
    describe.each(iterableRlsProducts)('%s', (_type, fixture) => {
      it('should reject INSERT with mismatched tenant_id / organization_id', async () => {
        await expect(
          unwrapDrizzle(fixture.insert(adminDb, { id: randomUUID(), tenantId: TEST_TENANT_B, createdBy: TEST_USER_A })),
        ).rejects.toThrow(/foreign key|violates/i);
      });

      it('should allow INSERT with matching tenant_id / organization_id', async () => {
        const id = randomUUID();
        await expect(
          fixture.insert(adminDb, { id, tenantId: TEST_TENANT_A, createdBy: TEST_USER_A }),
        ).resolves.not.toThrow();
        await adminDb.execute(sql.raw(`DELETE FROM ${fixture.table} WHERE id = '${id}'`));
      });
    });
  });

  // ---- Immutability triggers (apply regardless of role) ----

  describe('Immutability triggers', () => {
    type ImmutableEntityCase = [tableName: string, column: string, entityType: string, rowId: string];

    const baseImmutableColumns = ['id', 'tenant_id', 'entity_type', 'created_at', 'created_by'];

    const seededChannelRowIdsByTable = new Map<string, string>([
      ['organizations', TEST_ORG_A],
      ...iterableRlsProducts.flatMap(([, fixture]) =>
        fixture.plan.seedChannelRows.map((row) => [row.tableName, row.id] as const),
      ),
    ]);

    // Only target rows this suite seeds.
    const channelCases: ImmutableEntityCase[] = appConfig.channelEntityTypes.flatMap((entityType) => {
      const tableName = getTableName(entityTables[entityType as keyof typeof entityTables]);
      const rowId = seededChannelRowIdsByTable.get(tableName);
      if (!rowId) return [];
      return baseImmutableColumns.map((col): ImmutableEntityCase => [tableName, col, entityType, rowId]);
    });

    const seededProductRowIdsByTable = new Map<string, string>(
      iterableRlsProducts.map(([, fixture]) => [fixture.table, fixture.rowId]),
    );

    // Product entities add organization_id. Only target rows this suite seeds.
    const orgProductCases: ImmutableEntityCase[] = appConfig.productEntityTypes.flatMap((entityType) => {
      const tableName = getTableName(entityTables[entityType as keyof typeof entityTables]);
      const rowId = seededProductRowIdsByTable.get(tableName);
      if (!rowId) return [];
      return [...baseImmutableColumns, 'organization_id'].map(
        (col): ImmutableEntityCase => [tableName, col, entityType, rowId],
      );
    });

    const membershipCases: [string, string][] = membershipImmutableColumns.map((col) => ['memberships', col]);

    const allEntityCases = [...channelCases, ...orgProductCases];

    // Type-matched fake values so Postgres does not reject the cast before the trigger fires.
    const fakeValueForColumn = (column: string): string => {
      if (column === 'created_at') return "'2000-01-01T00:00:00Z'";
      if (column === 'entity_type' || column === 'tenant_id') return "'hacked'";
      // uuid columns: id, created_by, organization_id
      return "'00000000-0000-4000-a000-ffffffffffff'";
    };

    it.each(allEntityCases)('should reject %s.%s mutation (%s)', async (tableName, column, _entityType, rowId) => {
      await expect(
        unwrapDrizzle(
          adminDb.execute(
            sql.raw(
              `UPDATE ${quoteIdent(tableName)} SET ${quoteIdent(column)} = ${fakeValueForColumn(column)} WHERE id = '${rowId}'`,
            ),
          ),
        ),
      ).rejects.toThrow(/immutable/i);
    });

    it.each(membershipCases)('should reject %s.%s mutation', async (tableName, column) => {
      const fakeValue = ['tenant_id', 'channel_type'].includes(column)
        ? "'hacked'"
        : "'00000000-0000-4000-a000-ffffffffffff'";
      await expect(
        unwrapDrizzle(adminDb.execute(sql.raw(`UPDATE ${tableName} SET ${column} = ${fakeValue} WHERE 1=1`))),
      ).rejects.toThrow(/immutable/i);
    });

    it('should reject updates on append-only activities table', async () => {
      await expect(
        unwrapDrizzle(adminDb.execute(sql.raw("UPDATE activities SET id = 'hacked' WHERE 1=1"))),
      ).rejects.toThrow(/append.only|immutable/i);
    });

    it('should allow updating non-immutable columns', async () => {
      await expect(
        adminDb.execute(sql`UPDATE organizations SET name = 'Updated Name' WHERE id = ${TEST_ORG_A}`),
      ).resolves.not.toThrow();
      await adminDb.execute(sql`UPDATE organizations SET name = 'RLS Org A' WHERE id = ${TEST_ORG_A}`);
    });
  });

  // CDC stamps seq as `admin_role` with no tenant context, so BYPASSRLS must cover FORCE RLS.
  describe('CDC seq stamping (admin_role under FORCE RLS)', () => {
    let adminRoleDb: NodePgDatabase;

    beforeAll(async () => {
      if (!rolesAvailable) return;
      const ADMIN_ROLE_DB_URL = testAdminRoleDatabaseUrl;
      adminRoleDb = drizzle({
        connection: { connectionString: ADMIN_ROLE_DB_URL, connectionTimeoutMillis: 5_000 },
      });
    });

    it('admin_role has BYPASSRLS attribute', async () => {
      const rows = getRows<{ bypass: boolean }>(
        await adminDb.execute(sql`SELECT rolbypassrls AS bypass FROM pg_roles WHERE rolname = 'admin_role'`),
      );
      expect(rows[0]?.bypass).toBe(true);
    });

    it.skipIf(iterableRlsProducts.length === 0)(
      'admin_role can UPDATE seq on a product row without tenant context',
      async () => {
        const [, fixture] = iterableRlsProducts[0];
        const before = getRows<{ seq: string | number }>(
          await adminRoleDb.execute(sql.raw(`SELECT seq FROM ${fixture.table} WHERE id = '${fixture.rowId}'`)),
        );
        expect(before, 'admin_role must see the product row (BYPASSRLS)').toHaveLength(1);

        // bigint columns come back as strings from node-pg; coerce
        const newSeq = Number(before[0].seq ?? 0) + 1;
        const updateResult = await adminRoleDb.execute(
          sql.raw(
            `UPDATE ${fixture.table} SET seq = ${newSeq}, stx = stx - 'changedFields' WHERE id = '${fixture.rowId}'`,
          ),
        );

        expect((updateResult as { rowCount?: number }).rowCount, 'UPDATE must affect the row, not silently no-op').toBe(
          1,
        );

        const after = getRows<{ seq: string | number }>(
          await adminDb.execute(sql.raw(`SELECT seq FROM ${fixture.table} WHERE id = '${fixture.rowId}'`)),
        );
        expect(Number(after[0].seq)).toBe(newSeq);
      },
    );
  });
});
