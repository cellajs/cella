/**
 * RLS security regression tests.
 *
 * These tests verify that Row-Level Security policies correctly
 * isolate tenant data and prevent unauthorized access.
 *
 * Architecture:
 * - SELECT-only RLS policies on product entity tables (attachments, tasks, labels, yjs_documents)
 * - Write-through RLS policies (unconditional allow), write isolation enforced by guards + composite FKs + immutability triggers
 * - No RLS on channel entities (organizations, memberships), guarded at app layer
 *
 * IMPORTANT: These tests require PostgreSQL with RLS roles configured.
 * Run with `pnpm test:full` (not test:core).
 *
 * Connections:
 * - `adminDb` (postgres superuser): Setup/cleanup, bypasses RLS
 * - `runtimeDb` (runtime_role): Subject to RLS policies, used for assertions
 * - Session variables (app.tenant_id, app.user_id)
 *   are set via set_config() within transactions to drive RLS policy evaluation
 *
 * @see cella/ARCHITECTURE.md for full architecture documentation
 */

import { randomUUID } from 'node:crypto';
import { getTableName, type SQL, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { appConfig } from 'shared';
import { testAdminRoleDatabaseUrl, testRuntimeDatabaseUrl } from 'shared/test-db';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { nanoidTenant } from 'shared/utils/nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as adminDb, type Tx } from '#/db/db';
import { membershipImmutableColumns } from '#/db/immutability-triggers';
import { seenWindowMs, trackedEntityTypes } from '#/modules/seen/operations/mark-seen';
import { findUnseenCountsByUser } from '#/modules/seen/seen-queries';
import { entityTables } from '#/tables';

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

// Test IDs - deterministic UUIDs for reliable cleanup
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

// Runtime role connection (subject to RLS)
const RUNTIME_DB_URL = testRuntimeDatabaseUrl;
let runtimeDb: NodePgDatabase;

/** Whether runtime_role exists in the test database */
let rolesAvailable = false;
let requiredTablesAvailable = false;
/** Whether the seen_by table exists (partman-partitioned; may be absent in a minimal test DB). */
let seenByAvailable = false;

const attachmentHierarchyA = buildTestEntityHierarchyPlan({
  entityType: 'attachment',
  rootChannelId: TEST_ORG_A,
  makeChannelId: () => randomUUID(),
});
const quoteIdent = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

const channelColumnList = (plan: TestEntityHierarchyPlan) =>
  sql.raw(plan.sqlChannelColumns.map(({ columnName }) => `, ${quoteIdent(columnName)}`).join(''));

const contextValueList = (plan: TestEntityHierarchyPlan) =>
  plan.sqlChannelColumns.length > 0
    ? sql`, ${sql.join(
        plan.sqlChannelColumns.map(({ id }) => sql`${id}`),
        sql`, `,
      )}`
    : sql``;

async function seedEntityHierarchy(
  plan: TestEntityHierarchyPlan,
  tenantId: string,
  createdBy: string,
  slugPrefix: string,
) {
  for (const row of plan.seedChannelRows) {
    await adminDb.execute(sql`
      INSERT INTO ${sql.raw(quoteIdent(row.tableName))}
        (id, tenant_id, entity_type, name, slug, created_by, ${sql.raw(quoteIdent(row.parentColumnName))})
      VALUES
        (${row.id}, ${tenantId}, ${row.channelType}, ${`RLS ${row.channelType}`}, ${`${slugPrefix}-${row.channelType}-${row.id.slice(0, 8)}`}, ${createdBy}, ${row.parentId})
      ON CONFLICT (id) DO NOTHING
    `);
  }
}

async function cleanupEntityHierarchy(...plans: TestEntityHierarchyPlan[]) {
  for (const row of plans.flatMap((plan) => plan.seedChannelRows).reverse()) {
    await adminDb.execute(sql`DELETE FROM ${sql.raw(quoteIdent(row.tableName))} WHERE id = ${row.id}`);
  }
}

/**
 * Org-scoped product entities are the RLS-subject tables (tenant SELECT policy + FORCE RLS).
 * Derived from config so the suite adapts to whatever entity model is loaded:
 * base Cella → ['attachment']; a fork may add e.g. 'task', 'label'.
 */
const rlsProductTypes = appConfig.productEntityTypes;

/**
 * Per-entity seed fixtures for the generic RLS product-entity tests
 * (write-through, composite FK, CDC seq). This is the FORK EXTENSION POINT:
 * add an entry per org-scoped product entity a fork defines (e.g. `task`, `label`)
 * and the write-through / FK / CDC blocks automatically cover it.
 *
 * Each entry owns its own prerequisite + representative-row seeding so entities
 * with extra parents (e.g. a task needing a project) stay self-contained.
 */
interface RlsProductFixture {
  /** Table name (e.g. 'attachments'). */
  table: string;
  /** Pre-seeded representative row id (tenant A / org A) used by update/CDC tests. */
  rowId: string;
  /** Original name of the representative row, for restore after update tests. */
  rowName: string;
  /** Build an INSERT for a fresh row (caller supplies a unique id, no ON CONFLICT). */
  insert: (p: { id: string; tenantId: string; orgId: string; createdBy: string }) => SQL;
  /** Seed prerequisites + the representative row (runs as admin/superuser). */
  seed: () => Promise<void>;
  /** Remove the representative row + prerequisites. */
  cleanup: () => Promise<void>;
}

const rlsProductFixtures: Record<string, RlsProductFixture> = {
  attachment: {
    table: 'attachments',
    rowId: TEST_ATTACHMENT_A,
    rowName: 'Test File',
    insert: ({ id, tenantId, createdBy }) => sql`
        INSERT INTO attachments (id, entity_type, tenant_id, name, stx, keywords, created_by${channelColumnList(attachmentHierarchyA)}, bucket_name, filename, content_type, size, original_key)
        VALUES (${id}, 'attachment', ${tenantId}, 'WT File', '{}', '', ${createdBy}${contextValueList(attachmentHierarchyA)}, 'test-bucket', 'wt.txt', 'text/plain', '100', 'attachments/wt.txt')
      `,
    seed: async () => {
      await adminDb.execute(sql`
        INSERT INTO attachments (id, entity_type, tenant_id, name, stx, keywords, created_by${channelColumnList(attachmentHierarchyA)}, bucket_name, filename, content_type, size, original_key)
        VALUES
          (${TEST_ATTACHMENT_A}, 'attachment', ${TEST_TENANT_A}, 'Test File', '{}', '', ${TEST_USER_A}${contextValueList(attachmentHierarchyA)}, 'test-bucket', 'test.txt', 'text/plain', '1024', 'attachments/test.txt')
        ON CONFLICT (id) DO NOTHING
      `);
    },
    cleanup: async () => {
      await adminDb.execute(sql`DELETE FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`);
    },
  },
};

/**
 * RLS product types that have a fixture, what the generic blocks iterate (collection-time).
 * Table existence is checked at runtime in `beforeAll` (see {@link activeRlsProducts}).
 */
const iterableRlsProducts = rlsProductTypes
  .filter((t) => rlsProductFixtures[t])
  .map((t) => [t, rlsProductFixtures[t]] as const);

/** RLS product fixtures whose table actually exists in the test DB (populated in beforeAll). */
let activeRlsProducts: { type: string; fixture: RlsProductFixture }[] = [];

/**
 * Check if RLS roles exist in the test database.
 */
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
  // Base entities present in every Cella app, fork-specific product tables are checked per-fixture.
  const requiredTables = ['attachments', 'organizations', 'memberships'];
  const results = await Promise.all(requiredTables.map((tableName) => tableExists(tableName)));
  return results.every(Boolean);
}

/**
 * Create RLS roles in the test database if they don't exist.
 * Also re-applies the RLS setup (FORCE RLS, ownership, grants).
 *
 * Table targets are derived from the entity model so the setup adapts to whatever
 * product entities the app defines, base Cella forces RLS on `attachments` +
 * `yjs_documents`; a fork additionally covers e.g. `tasks`, `labels`.
 */
async function ensureRlsRoles() {
  // Create roles if missing (idempotent)
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

  // Non-RLS tables runtime_role must access (write isolation enforced by guards at the app layer).
  // seen_by is non-RLS (production classifies it in fullCrudTables), runtime_role reads it in the
  // NOT EXISTS of the unseen-count query, so it needs a grant here too.
  const nonRlsTables = ['organizations', 'memberships', 'inactive_memberships', 'users', 'tenants', 'seen_by'];
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

/**
 * Setup test data: tenants, users, orgs, memberships, attachments.
 * Uses adminDb (superuser) to bypass RLS for data insertion.
 */
async function setupTestData() {
  // Create test tenants
  await adminDb.execute(sql`
    INSERT INTO tenants (id, name, status, created_at, updated_at)
    VALUES
      (${TEST_TENANT_A}, 'RLS Test Tenant A', 'active', NOW(), NOW()),
      (${TEST_TENANT_B}, 'RLS Test Tenant B', 'active', NOW(), NOW()),
      (${TEST_TENANT_EMPTY}, 'RLS Test Tenant Empty', 'active', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Create test users
  await adminDb.execute(sql`
    INSERT INTO users (id, entity_type, name, slug, email, created_at)
    VALUES
      (${TEST_USER_A}, 'user', 'RLS User A', ${`rls-user-a-${Date.now()}`}, ${`rls-a-${Date.now()}@test.com`}, NOW()),
      (${TEST_USER_B}, 'user', 'RLS User B', ${`rls-user-b-${Date.now()}`}, ${`rls-b-${Date.now()}@test.com`}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Create orgs: Org A in Tenant A, Org B in Tenant B (1 tenant = 1 organization)
  await adminDb.execute(sql`
    INSERT INTO organizations (id, entity_type, tenant_id, name, slug, created_by, created_at)
    VALUES
      (${TEST_ORG_A}, 'organization', ${TEST_TENANT_A}, 'RLS Org A', ${`rls-org-a-${Date.now()}`}, ${TEST_USER_A}, NOW()),
      (${TEST_ORG_B}, 'organization', ${TEST_TENANT_B}, 'RLS Org B', ${`rls-org-b-${Date.now()}`}, ${TEST_USER_B}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await seedEntityHierarchy(attachmentHierarchyA, TEST_TENANT_A, TEST_USER_A, `rls-a-${Date.now()}`);

  // Create memberships: User A in Org A (Tenant A), User B in Org B (Tenant B)
  await adminDb.execute(sql`
    INSERT INTO memberships (id, tenant_id, channel_type, channel_id, user_id, role, created_by, display_order, organization_id)
    VALUES
      (${TEST_MEMBERSHIP_A}, ${TEST_TENANT_A}, 'organization', ${TEST_ORG_A}, ${TEST_USER_A}, 'admin', ${TEST_USER_A}, 1, ${TEST_ORG_A}),
      (${TEST_MEMBERSHIP_B}, ${TEST_TENANT_B}, 'organization', ${TEST_ORG_B}, ${TEST_USER_B}, 'admin', ${TEST_USER_B}, 1, ${TEST_ORG_B})
    ON CONFLICT (id) DO NOTHING
  `);

  // Seed RLS-subject product entities via their fixtures (base: attachment; forks add more).
  for (const { fixture } of activeRlsProducts) {
    await fixture.seed();
  }

  // Create activity row (needed for append-only trigger test). table_name is a plain
  // varchar (no FK), use any active product table, falling back to a base table.
  const activityTable = activeRlsProducts[0]?.fixture.table ?? 'attachments';
  await adminDb.execute(sql`
    INSERT INTO activities (id, tenant_id, action, table_name, type, created_at)
    VALUES (${TEST_ACTIVITY_A}, ${TEST_TENANT_A}, 'create', ${activityTable}, 'entity', NOW())
    ON CONFLICT DO NOTHING
  `);
}

/**
 * Cleanup all test data (reverse order of creation due to FKs).
 */
async function cleanupTestData() {
  await adminDb.execute(sql`DELETE FROM activities WHERE id = ${TEST_ACTIVITY_A}`);
  for (const { fixture } of activeRlsProducts) {
    await fixture.cleanup();
  }
  await adminDb.execute(sql`DELETE FROM memberships WHERE id IN (${TEST_MEMBERSHIP_A}, ${TEST_MEMBERSHIP_B})`);
  await cleanupEntityHierarchy(attachmentHierarchyA);
  await adminDb.execute(sql`DELETE FROM organizations WHERE id IN (${TEST_ORG_A}, ${TEST_ORG_B})`);
  await adminDb.execute(sql`DELETE FROM users WHERE id IN (${TEST_USER_A}, ${TEST_USER_B})`);
  await adminDb.execute(
    sql`DELETE FROM tenants WHERE id IN (${TEST_TENANT_A}, ${TEST_TENANT_B}, ${TEST_TENANT_EMPTY})`,
  );
}

/**
 * Normalize drizzle execute() results to a plain array of rows.
 * node-postgres returns QueryResult (with .rows), PgAsyncDatabase may return array-like.
 */
function getRows<T = Record<string, unknown>>(result: any): T[] {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

/**
 * Drizzle wraps PG errors in DrizzleQueryError (message: "Failed query: ...").
 * Unwrap to the underlying PG error so we can match trigger/constraint messages.
 */
const unwrapDrizzle = <T>(promise: Promise<T>) =>
  promise.catch((err) => {
    throw err.cause ?? err;
  });

/** Transaction type from NodePgDatabase, avoids `as unknown as` for tx ↔ db mismatch. */
type NodePgTx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/**
 * Helper: Execute a query as runtime_role with RLS session variables.
 * Returns rows array from an RLS-subject connection.
 */
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

/**
 * Helper: Execute a query as runtime_role WITHOUT any session context.
 * Verifies fail-closed behavior (no context yields zero rows).
 */
async function queryWithoutChannel<T = Record<string, unknown>>(
  queryFn: (tx: NodePgTx) => Promise<unknown>,
): Promise<T[]> {
  return runtimeDb.transaction(async (tx) => {
    // Explicitly clear any lingering context
    await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', '', true)`);
    const result = await queryFn(tx);
    return getRows<T>(result);
  });
}

// Session context tests (run with superuser connection)

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

// RLS policy verification (runtime_role connection, genuinely subject to RLS)

/**
 * Whether the environment can run the RLS suite: roles + base tables present.
 * Checked at module load (after global-setup migrations) so the suite skips
 * gracefully on a DB without RLS roles rather than failing every assertion.
 */
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

    // 1. Ensure RLS roles exist in test database
    await ensureRlsRoles();
    rolesAvailable = await checkRolesExist();

    if (!rolesAvailable) {
      console.warn('runtime_role not available, skipping RLS policy tests');
      return;
    }

    // 2. Create runtime_role connection (subject to RLS)
    runtimeDb = drizzle({
      connection: { connectionString: RUNTIME_DB_URL, connectionTimeoutMillis: 5_000 },
    });

    // 3. Verify connection works
    const rows = getRows<{ role: string }>(await runtimeDb.execute(sql`SELECT current_user as role`));
    expect(rows[0].role).toBe('runtime_role');

    // 4. Resolve which RLS product fixtures have a backing table in this DB
    activeRlsProducts = [];
    for (const [type, fixture] of iterableRlsProducts) {
      if (await tableExists(fixture.table)) activeRlsProducts.push({ type, fixture });
    }

    // 5. Set up test data as superuser
    await setupTestData();

    // 6. seen_by is partman-partitioned, record whether it exists for the unseen-count tests.
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
      // Channel entities rely on app-layer guards, so runtime_role can read all rows.
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    it('should return zero attachments without tenant context', async () => {
      const rows = await queryWithoutChannel(async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`),
      );
      expect(rows).toHaveLength(0);
    });

    it('should allow reading memberships without context (no RLS on memberships)', async () => {
      // Memberships rely on app-layer guards, so runtime_role can read all rows.
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
      // No RLS, both orgs visible
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
      // No RLS on organizations, insert succeeds (guard middleware prevents this at API layer).
      // Targets the org-less tenant: aiming at Tenant B would trip organizations_tenant_id_key
      // (1 tenant = 1 org) and mask the absence of RLS this test is asserting.
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
            INSERT INTO organizations (id, entity_type, tenant_id, name, slug, created_by, created_at)
            VALUES (${fakeOrgId}, 'organization', ${TEST_TENANT_EMPTY}, 'Fake Org', ${`rls-fake-${Date.now()}`}, ${TEST_USER_A}, NOW())
          `),
      );
      // Cleanup
      await adminDb.execute(sql`DELETE FROM organizations WHERE id = ${fakeOrgId}`);
    });

    it('should allow inserting membership into any tenant (no RLS on memberships)', async () => {
      // No RLS on memberships, insert succeeds (guard middleware prevents this at API layer)
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
            INSERT INTO memberships (id, tenant_id, channel_type, channel_id, user_id, role, created_by, display_order, organization_id)
            VALUES ('00000000-0000-4000-a000-000000000303', ${TEST_TENANT_B}, 'organization', ${TEST_ORG_B}, ${TEST_USER_A}, 'member', ${TEST_USER_A}, 99, ${TEST_ORG_B})
          `),
      );
      // Cleanup
      await adminDb.execute(sql`DELETE FROM memberships WHERE id = '00000000-0000-4000-a000-000000000303'`);
    });

    it('should allow updating organizations in any tenant (no RLS, app-layer isolation)', async () => {
      // No RLS on organizations, update succeeds even cross-tenant
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`UPDATE organizations SET name = 'Updated Cross' WHERE id = ${TEST_ORG_B}`),
      );
      // Restore
      await adminDb.execute(sql`UPDATE organizations SET name = 'RLS Org B' WHERE id = ${TEST_ORG_B}`);
    });
  });

  // ---- Tenant-scoped attachment access (org isolation is app-layer) ----

  describe('Tenant-scoped attachment access', () => {
    it('should deny access to attachments in another tenant', async () => {
      // User B (Tenant B) should not see Tenant A's attachment
      const rows = await queryAsRuntimeRole(TEST_TENANT_B, TEST_USER_B, async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`),
      );
      expect(rows).toHaveLength(0);
    });

    it('should allow access to attachments within own tenant', async () => {
      // User A (Tenant A) should see attachment in their tenant
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
    // getUnseenCounts delegates to findUnseenCountsByUser, which counts entity-table rows the user
    // has not seen. Entity tables have FORCE RLS, so this MUST run inside a tenant context
    // (tenantRead sets app.tenant_id); a context-less baseDb read silently returns zero and the
    // unseen badge breaks. These lock that behaviour in. Org A holds exactly one in-window
    // attachment (TEST_ATTACHMENT_A) and User A has no seen_by rows initially.
    type UnseenRow = { channelId: string; entityType: string; unseenCount: number };
    const cutoff = () => new Date(Date.now() - seenWindowMs).toISOString();
    const countUnseen = (tx: NodePgTx) =>
      findUnseenCountsByUser({ var: { db: tx } } as Parameters<typeof findUnseenCountsByUser>[0], {
        userId: TEST_USER_A,
        channelIds: [TEST_ORG_A],
        entityTypes: trackedEntityTypes,
        cutoff: cutoff(),
      });

    it('counts in-window unseen entities under tenant context', async () => {
      if (!rolesAvailable || !requiredTablesAvailable || !seenByAvailable) return;
      const rows = await queryAsRuntimeRole<UnseenRow>(TEST_TENANT_A, TEST_USER_A, countUnseen);
      const orgA = rows.find((r) => r.channelId === TEST_ORG_A);
      expect(orgA).toBeDefined();
      expect(orgA?.entityType).toBe('attachment');
      expect(orgA?.unseenCount).toBe(1);
    });

    it('returns zero without tenant context (RLS regression canary)', async () => {
      if (!rolesAvailable || !requiredTablesAvailable || !seenByAvailable) return;
      // Entity rows are invisible without app.tenant_id → no unseen counts. If getUnseenCounts
      // ever reverts to a context-less baseDb read, this fails.
      const rows = await queryWithoutChannel<UnseenRow>(countUnseen);
      expect(rows).toHaveLength(0);
    });

    it('drops the count once the entity is marked seen', async () => {
      if (!rolesAvailable || !requiredTablesAvailable || !seenByAvailable) return;
      const seenId = '00000000-0000-4000-a000-0000000000a1';
      // No ON CONFLICT arbiter: seen_by is partitioned by created_at, so a unique index on
      // (user_id, entity_id) cannot exist — every unique index on a partitioned table must carry
      // the partition column. mark-seen dedups with NOT EXISTS for the same reason. A plain insert
      // is right here anyway: the row is a fixture with a fixed id, dropped again in `finally`.
      await adminDb.execute(sql`
        INSERT INTO seen_by (id, user_id, entity_id, entity_type, channel_id, organization_id, tenant_id, created_at)
        VALUES (${seenId}, ${TEST_USER_A}, ${TEST_ATTACHMENT_A}, 'attachment', ${TEST_ORG_A}, ${TEST_ORG_A}, ${TEST_TENANT_A}, NOW())
      `);
      try {
        const rows = await queryAsRuntimeRole<UnseenRow>(TEST_TENANT_A, TEST_USER_A, countUnseen);
        // Org A's only in-window attachment is now seen → no unseen row for that context.
        expect(rows.find((r) => r.channelId === TEST_ORG_A)).toBeUndefined();
      } finally {
        await adminDb.execute(sql`DELETE FROM seen_by WHERE id = ${seenId}`);
      }
    });
  });

  // ---- Unauthenticated write denial ----

  describe('Unauthenticated write denial', () => {
    it('should allow membership insert without authentication (no RLS on memberships)', async () => {
      // No RLS on memberships, insert succeeds. Guard middleware prevents this at API layer.
      // Use TEST_USER_B + TEST_ORG_A to avoid duplicate (tenant_id, user_id, channel_id) with setup data.
      await queryAsRuntimeRole(TEST_TENANT_A, '', async (tx) =>
        tx.execute(sql`
            INSERT INTO memberships (id, tenant_id, channel_type, channel_id, user_id, role, created_by, display_order, organization_id)
            VALUES ('00000000-0000-4000-a000-000000000306', ${TEST_TENANT_A}, 'organization', ${TEST_ORG_A}, ${TEST_USER_B}, 'member', ${TEST_USER_B}, 99, ${TEST_ORG_A})
          `),
      );
      // Cleanup
      await adminDb.execute(sql`DELETE FROM memberships WHERE id = '00000000-0000-4000-a000-000000000306'`);
    });
  });

  // ---- Write-through on RLS tables (INSERT/UPDATE/DELETE must succeed) ----

  describe('Write-through on RLS tables', () => {
    // These tests would have caught the original bug where FORCE RLS + SELECT-only policy
    // caused all writes to be denied with "new row violates row-level security policy".
    // Driven by the entity model: covers every org-scoped product entity with a fixture.

    describe.each(iterableRlsProducts)('%s', (_type, fixture) => {
      it('should allow INSERT as runtime_role', async () => {
        const id = randomUUID();
        await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
          tx.execute(fixture.insert({ id, tenantId: TEST_TENANT_A, orgId: TEST_ORG_A, createdBy: TEST_USER_A })),
        );
        await adminDb.execute(sql.raw(`DELETE FROM ${fixture.table} WHERE id = '${id}'`));
      });

      it('should allow UPDATE as runtime_role', async () => {
        await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
          tx.execute(sql.raw(`UPDATE ${fixture.table} SET name = 'Updated Row' WHERE id = '${fixture.rowId}'`)),
        );
        // Restore
        await adminDb.execute(
          sql.raw(`UPDATE ${fixture.table} SET name = '${fixture.rowName}' WHERE id = '${fixture.rowId}'`),
        );
      });

      it('should allow DELETE as runtime_role', async () => {
        const id = randomUUID();
        await adminDb.execute(
          fixture.insert({ id, tenantId: TEST_TENANT_A, orgId: TEST_ORG_A, createdBy: TEST_USER_A }),
        );
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
        // Write without any session context, write-through policy uses sql`true`
        await queryWithoutChannel(async (tx) =>
          tx.execute(fixture.insert({ id, tenantId: TEST_TENANT_A, orgId: TEST_ORG_A, createdBy: TEST_USER_A })),
        );
        // SELECT without context should still be denied (fail-closed read)
        const rows = await queryWithoutChannel(async (tx) =>
          tx.execute(sql.raw(`SELECT id FROM ${fixture.table} WHERE id = '${id}'`)),
        );
        expect(rows).toHaveLength(0);
        // Cleanup
        await adminDb.execute(sql.raw(`DELETE FROM ${fixture.table} WHERE id = '${id}'`));
      },
    );
  });

  // ---- Composite FK violation (tenant_id must match organization's tenant_id) ----

  describe('Composite foreign key enforcement', () => {
    describe.each(iterableRlsProducts)('%s', (_type, fixture) => {
      it('should reject INSERT with mismatched tenant_id / organization_id', async () => {
        // Org A belongs to Tenant A, inserting with Tenant B should violate the composite FK
        await expect(
          unwrapDrizzle(
            adminDb.execute(
              fixture.insert({ id: randomUUID(), tenantId: TEST_TENANT_B, orgId: TEST_ORG_A, createdBy: TEST_USER_A }),
            ),
          ),
        ).rejects.toThrow(/foreign key|violates/i);
      });

      it('should allow INSERT with matching tenant_id / organization_id', async () => {
        const id = randomUUID();
        await expect(
          adminDb.execute(fixture.insert({ id, tenantId: TEST_TENANT_A, orgId: TEST_ORG_A, createdBy: TEST_USER_A })),
        ).resolves.not.toThrow();
        // Cleanup
        await adminDb.execute(sql.raw(`DELETE FROM ${fixture.table} WHERE id = '${id}'`));
      });
    });
  });

  // ---- Immutability triggers (apply regardless of role) ----
  // Data-driven over configured entities that this suite seeds explicitly.

  describe('Immutability triggers', () => {
    type ImmutableEntityCase = [tableName: string, column: string, entityType: string, rowId: string];

    // Base entity columns (shared by context + product entities)
    const baseImmutableColumns = ['id', 'tenant_id', 'entity_type', 'created_at', 'created_by'];

    const seededChannelRowIdsByTable = new Map<string, string>([
      ['organizations', TEST_ORG_A],
      ...attachmentHierarchyA.seedChannelRows.map((row) => [row.tableName, row.id] as const),
    ]);

    // Channel entities: use base columns. Only target rows this suite owns.
    const channelCases: ImmutableEntityCase[] = appConfig.channelEntityTypes.flatMap((entityType) => {
      const tableName = getTableName(entityTables[entityType as keyof typeof entityTables]);
      const rowId = seededChannelRowIdsByTable.get(tableName);
      if (!rowId) return [];
      return baseImmutableColumns.map((col): ImmutableEntityCase => [tableName, col, entityType, rowId]);
    });

    const seededProductRowIdsByTable = new Map<string, string>(
      iterableRlsProducts.map(([, fixture]) => [fixture.table, fixture.rowId]),
    );

    // Org-scoped product entities: base + organization_id. Only target rows this suite owns.
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

    // Type-appropriate fake values per column type so Postgres doesn't reject the type cast before the trigger fires
    const fakeValueForColumn = (column: string): string => {
      if (column === 'created_at') return "'2000-01-01T00:00:00Z'";
      if (column === 'entity_type' || column === 'tenant_id') return "'hacked'";
      // uuid columns: id, created_by, organization_id
      return "'00000000-0000-4000-a000-ffffffffffff'";
    };

    it.each(allEntityCases)('should reject %s.%s mutation (%s)', async (tableName, column, _entityType, rowId) => {
      // Attempt to modify an immutable column, trigger should raise exception
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
      // The activities table is append-only, all updates are rejected
      await expect(
        unwrapDrizzle(adminDb.execute(sql.raw("UPDATE activities SET id = 'hacked' WHERE 1=1"))),
      ).rejects.toThrow(/append.only|immutable/i);
    });

    it('should allow updating non-immutable columns', async () => {
      // name is mutable, should succeed
      await expect(
        adminDb.execute(sql`UPDATE organizations SET name = 'Updated Name' WHERE id = ${TEST_ORG_A}`),
      ).resolves.not.toThrow();
      // Restore original name
      await adminDb.execute(sql`UPDATE organizations SET name = 'RLS Org A' WHERE id = ${TEST_ORG_A}`);
    });
  });

  // ---- CDC seq stamping invariant ----
  // Regression test: the CDC worker runs as admin_role (no app.tenant_id set)
  // and must be able to UPDATE seq on product entity rows under FORCE RLS.
  // Without BYPASSRLS on the connecting role, the tenant SELECT policy hides
  // every row and the UPDATE silently affects 0 rows, counters then advance
  // while row.seq stays at 0, breaking the sync engine.
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
        // Read current seq (admin connection, no app.tenant_id set anywhere)
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

        // node-pg returns rowCount; the regression bug manifests as 0 here
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
