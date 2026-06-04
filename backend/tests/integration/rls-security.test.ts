/**
 * RLS security regression tests.
 *
 * These tests verify that Row-Level Security policies correctly
 * isolate tenant data and prevent unauthorized access.
 *
 * Architecture:
 * - SELECT-only RLS policies on product entity tables (attachments, tasks, labels, yjs_documents)
 * - Write-through RLS policies (unconditional allow) — write isolation enforced by guards + composite FKs + immutability triggers
 * - No RLS on context entities (organizations, memberships) — guarded at app layer
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
 * @see info/ARCHITECTURE.md for full architecture documentation
 */

import { getTableName, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { appConfig, hierarchy } from 'shared';
import { nanoidTenant } from 'shared/nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as adminDb, type Tx } from '#/db/db';
import { entityTables } from '#/tables';

/** Local read-only tenant context helper — mirrors tenantRead without importing it. */
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
const TEST_USER_A = '00000000-0000-4000-a000-000000000001';
const TEST_USER_B = '00000000-0000-4000-a000-000000000002';
const TEST_ORG_A = '00000000-0000-4000-a000-000000000003';
const TEST_ORG_B = '00000000-0000-4000-a000-000000000004';
const TEST_ORG_C = '00000000-0000-4000-a000-000000000005';
const TEST_MEMBERSHIP_A = '00000000-0000-4000-a000-000000000006';
const TEST_MEMBERSHIP_B = '00000000-0000-4000-a000-000000000007';
const TEST_PAGE_A = '00000000-0000-4000-a000-000000000008';
const TEST_PAGE_B = '00000000-0000-4000-a000-000000000009';
const TEST_PAGE_PUBLIC = '00000000-0000-4000-a000-00000000000a';
const TEST_PROJECT_A = '00000000-0000-4000-a000-00000000000b';
const TEST_TASK_A = '00000000-0000-4000-a000-00000000000c';
const TEST_LABEL_A = '00000000-0000-4000-a000-00000000000d';
const TEST_ATTACHMENT_A = '00000000-0000-4000-a000-00000000000e';
const TEST_ATTACHMENT_C = '00000000-0000-4000-a000-00000000000f';
const TEST_WORKSPACE_A = '00000000-0000-4000-a000-000000000010';
const TEST_CHAT_A = '00000000-0000-4000-a000-000000000011';
const TEST_CONVERSATION_A = '00000000-0000-4000-a000-000000000012';
const TEST_ACTIVITY_A = 'rls-activity-001';

// Runtime role connection (subject to RLS)
const RUNTIME_DB_URL = 'postgres://runtime_role:dev_password@0.0.0.0:5434/postgres';
let runtimeDb: NodePgDatabase;

/** Whether runtime_role exists in the test database */
let rolesAvailable = false;

/** Parentless product entity types (no org FK, no RLS) — derived from hierarchy config */
const parentlessTypes = new Set<string>(hierarchy.parentlessProductTypes);

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

/**
 * Create RLS roles in the test database if they don't exist.
 * Also re-applies the RLS setup (FORCE RLS, ownership, grants).
 */
async function ensureRlsRoles() {
  // Create roles if missing
  await adminDb.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime_role') THEN
        CREATE ROLE runtime_role WITH LOGIN PASSWORD 'dev_password';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
        CREATE ROLE admin_role WITH LOGIN BYPASSRLS PASSWORD 'dev_password';
      END IF;

      GRANT USAGE ON SCHEMA public TO runtime_role;
      GRANT ALL ON SCHEMA public TO admin_role;

      -- Table ownership and FORCE RLS (product entities only)
      ALTER TABLE attachments OWNER TO admin_role;
      ALTER TABLE tasks OWNER TO admin_role;
      ALTER TABLE labels OWNER TO admin_role;
      ALTER TABLE yjs_documents OWNER TO admin_role;

      ALTER TABLE attachments FORCE ROW LEVEL SECURITY;
      ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
      ALTER TABLE labels FORCE ROW LEVEL SECURITY;
      ALTER TABLE yjs_documents FORCE ROW LEVEL SECURITY;

      -- Grants for runtime_role (RLS-subject tables)
      GRANT SELECT, INSERT, UPDATE, DELETE ON attachments TO runtime_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO runtime_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON labels TO runtime_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON yjs_documents TO runtime_role;

      -- Grants for runtime_role (non-RLS tables — includes pages, which have no RLS)
      GRANT SELECT, INSERT, UPDATE, DELETE ON pages TO runtime_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO runtime_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO runtime_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO runtime_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON inactive_memberships TO runtime_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON users TO runtime_role;
      GRANT SELECT ON tenants TO runtime_role;

      -- Admin gets full access
      GRANT ALL ON ALL TABLES IN SCHEMA public TO admin_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin_role;

      -- pg_catalog for JSONB operators
      GRANT USAGE ON SCHEMA pg_catalog TO runtime_role;
    END $$;
  `);
}

/**
 * Setup test data: tenants, users, orgs, memberships, pages, attachments.
 * Uses adminDb (superuser) to bypass RLS for data insertion.
 */
async function setupTestData() {
  // Create test tenants
  await adminDb.execute(sql`
    INSERT INTO tenants (id, name, status, created_at, updated_at)
    VALUES
      (${TEST_TENANT_A}, 'RLS Test Tenant A', 'active', NOW(), NOW()),
      (${TEST_TENANT_B}, 'RLS Test Tenant B', 'active', NOW(), NOW())
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

  // Create orgs: Org A and Org C in Tenant A, Org B in Tenant B
  await adminDb.execute(sql`
    INSERT INTO organizations (id, entity_type, tenant_id, name, slug, created_by, created_at)
    VALUES
      (${TEST_ORG_A}, 'organization', ${TEST_TENANT_A}, 'RLS Org A', ${`rls-org-a-${Date.now()}`}, ${TEST_USER_A}, NOW()),
      (${TEST_ORG_B}, 'organization', ${TEST_TENANT_B}, 'RLS Org B', ${`rls-org-b-${Date.now()}`}, ${TEST_USER_B}, NOW()),
      (${TEST_ORG_C}, 'organization', ${TEST_TENANT_A}, 'RLS Org C', ${`rls-org-c-${Date.now()}`}, ${TEST_USER_B}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Create memberships: User A in Org A (Tenant A), User B in Org B (Tenant B)
  // Note: User A has NO membership in Org C — cross-org isolation tested at app layer
  await adminDb.execute(sql`
    INSERT INTO memberships (id, tenant_id, context_type, context_id, user_id, role, created_by, display_order, organization_id)
    VALUES
      (${TEST_MEMBERSHIP_A}, ${TEST_TENANT_A}, 'organization', ${TEST_ORG_A}, ${TEST_USER_A}, 'admin', ${TEST_USER_A}, 1, ${TEST_ORG_A}),
      (${TEST_MEMBERSHIP_B}, ${TEST_TENANT_B}, 'organization', ${TEST_ORG_B}, ${TEST_USER_B}, 'admin', ${TEST_USER_B}, 1, ${TEST_ORG_B})
    ON CONFLICT (id) DO NOTHING
  `);

  // Create pages: private page + one public page (pages have no tenant)
  await adminDb.execute(sql`
    INSERT INTO pages (id, entity_type, name, stx, keywords, created_by, display_order, public_at)
    VALUES
      (${TEST_PAGE_A}, 'page', 'Private Page A', '{}', '', ${TEST_USER_A}, 1, null),
      (${TEST_PAGE_B}, 'page', 'Private Page B', '{}', '', ${TEST_USER_B}, 1, null),
      (${TEST_PAGE_PUBLIC}, 'page', 'Public Page A', '{}', '', ${TEST_USER_A}, 2, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Create project in Org A (needed for task/label FKs)
  await adminDb.execute(sql`
    INSERT INTO projects (id, entity_type, tenant_id, name, slug, organization_id, created_at)
    VALUES (${TEST_PROJECT_A}, 'project', ${TEST_TENANT_A}, 'RLS Project A', ${`rls-proj-a-${Date.now()}`}, ${TEST_ORG_A}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Create task in Org A / Project A
  await adminDb.execute(sql`
    INSERT INTO tasks (id, entity_type, tenant_id, name, stx, keywords, summary, variant, display_order, status, organization_id, project_id, created_by)
    VALUES (${TEST_TASK_A}, 'task', ${TEST_TENANT_A}, 'RLS Task A', '{}', '', '', 1, 1, 5, ${TEST_ORG_A}, ${TEST_PROJECT_A}, ${TEST_USER_A})
    ON CONFLICT (id) DO NOTHING
  `);

  // Create label in Org A / Project A
  await adminDb.execute(sql`
    INSERT INTO labels (id, entity_type, tenant_id, name, stx, keywords, organization_id, project_id, created_by)
    VALUES (${TEST_LABEL_A}, 'label', ${TEST_TENANT_A}, 'RLS Label A', '{}', '', ${TEST_ORG_A}, ${TEST_PROJECT_A}, ${TEST_USER_A})
    ON CONFLICT (id) DO NOTHING
  `);

  // Create attachments: one in Org A (User A has membership), one in Org C (User A has NO membership)
  await adminDb.execute(sql`
    INSERT INTO attachments (id, entity_type, tenant_id, name, stx, keywords, created_by, organization_id, bucket_name, filename, content_type, size, original_key)
    VALUES
      (${TEST_ATTACHMENT_A}, 'attachment', ${TEST_TENANT_A}, 'Test File', '{}', '', ${TEST_USER_A}, ${TEST_ORG_A}, 'test-bucket', 'test.txt', 'text/plain', '1024', 'attachments/test.txt'),
      (${TEST_ATTACHMENT_C}, 'attachment', ${TEST_TENANT_A}, 'Org C File', '{}', '', ${TEST_USER_B}, ${TEST_ORG_C}, 'test-bucket', 'orgc.txt', 'text/plain', '512', 'attachments/orgc.txt')
    ON CONFLICT (id) DO NOTHING
  `);

  // Create workspace in Org A (needed for immutability trigger tests)
  await adminDb.execute(sql`
    INSERT INTO workspaces (id, entity_type, tenant_id, name, slug, organization_id, created_by, created_at)
    VALUES (${TEST_WORKSPACE_A}, 'workspace', ${TEST_TENANT_A}, 'RLS Workspace A', ${`rls-ws-a-${Date.now()}`}, ${TEST_ORG_A}, ${TEST_USER_A}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Create AI chat and message in Org A (needed for immutability trigger tests on chats / messages)
  await adminDb.execute(sql`
    INSERT INTO chats (id, entity_type, tenant_id, name, stx, keywords, organization_id, created_by)
    VALUES (${TEST_CHAT_A}, 'chat', ${TEST_TENANT_A}, 'RLS Chat A', '{}', '', ${TEST_ORG_A}, ${TEST_USER_A})
    ON CONFLICT (id) DO NOTHING
  `);
  await adminDb.execute(sql`
    INSERT INTO messages (id, entity_type, tenant_id, name, stx, keywords, organization_id, chat_id, role, created_by)
    VALUES (${TEST_CONVERSATION_A}, 'message', ${TEST_TENANT_A}, 'RLS Message A', '{}', '', ${TEST_ORG_A}, ${TEST_CHAT_A}, 'user', ${TEST_USER_A})
    ON CONFLICT (id) DO NOTHING
  `);

  // Create activity row (needed for append-only trigger test)
  await adminDb.execute(sql`
    INSERT INTO activities (id, tenant_id, action, table_name, type, created_at)
    VALUES (${TEST_ACTIVITY_A}, ${TEST_TENANT_A}, 'create', 'tasks', 'entity', NOW())
    ON CONFLICT DO NOTHING
  `);
}

/**
 * Cleanup all test data (reverse order of creation due to FKs).
 */
async function cleanupTestData() {
  await adminDb.execute(sql`DELETE FROM activities WHERE id = ${TEST_ACTIVITY_A}`);
  await adminDb.execute(sql`DELETE FROM messages WHERE id = ${TEST_CONVERSATION_A}`);
  await adminDb.execute(sql`DELETE FROM chats WHERE id = ${TEST_CHAT_A}`);
  await adminDb.execute(sql`DELETE FROM yjs_documents WHERE entity_id IN (${TEST_TASK_A}, ${TEST_LABEL_A})`);
  await adminDb.execute(sql`DELETE FROM tasks WHERE id = ${TEST_TASK_A}`);
  await adminDb.execute(sql`DELETE FROM labels WHERE id = ${TEST_LABEL_A}`);
  await adminDb.execute(sql`DELETE FROM attachments WHERE id IN (${TEST_ATTACHMENT_A}, ${TEST_ATTACHMENT_C})`);
  await adminDb.execute(sql`DELETE FROM pages WHERE id IN (${TEST_PAGE_A}, ${TEST_PAGE_B}, ${TEST_PAGE_PUBLIC})`);
  await adminDb.execute(sql`DELETE FROM workspaces WHERE id = ${TEST_WORKSPACE_A}`);
  await adminDb.execute(sql`DELETE FROM memberships WHERE id IN (${TEST_MEMBERSHIP_A}, ${TEST_MEMBERSHIP_B})`);
  await adminDb.execute(sql`DELETE FROM projects WHERE id = ${TEST_PROJECT_A}`);
  await adminDb.execute(sql`DELETE FROM organizations WHERE id IN (${TEST_ORG_A}, ${TEST_ORG_B}, ${TEST_ORG_C})`);
  await adminDb.execute(sql`DELETE FROM users WHERE id IN (${TEST_USER_A}, ${TEST_USER_B})`);
  await adminDb.execute(sql`DELETE FROM tenants WHERE id IN (${TEST_TENANT_A}, ${TEST_TENANT_B})`);
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

/** Transaction type from NodePgDatabase — avoids `as unknown as` for tx ↔ db mismatch. */
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
 * Used to verify fail-closed behavior (no context → zero rows).
 */
async function queryWithoutContext<T = Record<string, unknown>>(
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

// ============================================================================
// Session context tests (run with superuser connection)
// ============================================================================

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

      // set_config with `true` makes variables transaction-scoped — they reset on commit
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

// ============================================================================
// RLS policy verification (runtime_role connection — genuinely subject to RLS)
// ============================================================================

describe('RLS Policy Verification', () => {
  beforeAll(async () => {
    // 1. Ensure RLS roles exist in test database
    await ensureRlsRoles();
    rolesAvailable = await checkRolesExist();

    if (!rolesAvailable) {
      console.warn('runtime_role not available — skipping RLS policy tests');
      return;
    }

    // 2. Create runtime_role connection (subject to RLS)
    runtimeDb = drizzle({
      connection: { connectionString: RUNTIME_DB_URL, connectionTimeoutMillis: 5_000 },
    });

    // 3. Verify connection works
    const rows = getRows<{ role: string }>(await runtimeDb.execute(sql`SELECT current_user as role`));
    expect(rows[0].role).toBe('runtime_role');

    // 4. Set up test data as superuser
    await setupTestData();
  });

  afterAll(async () => {
    if (!rolesAvailable) return;
    await cleanupTestData();
  });

  // ---- Fail-closed: no context → zero rows ----

  describe('Fail-closed (no context)', () => {
    it('should allow reading organizations without tenant context (no RLS on context entities)', async () => {
      const rows = await queryWithoutContext(async (tx) =>
        tx.execute(sql`SELECT id FROM organizations WHERE id IN (${TEST_ORG_A}, ${TEST_ORG_B})`),
      );
      // Context entities no longer have RLS — runtime_role can read all rows
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    it('should read all pages without tenant context (no RLS on pages)', async () => {
      // Pages have no RLS — all pages are readable regardless of context.
      // Access control for pages is enforced at the API layer (sysAdminGuard for writes, publicGuard for reads).
      const rows = await queryWithoutContext(async (tx) =>
        tx.execute(sql`SELECT id FROM pages WHERE id IN (${TEST_PAGE_A}, ${TEST_PAGE_B}, ${TEST_PAGE_PUBLIC})`),
      );
      expect(rows).toHaveLength(3);
    });

    it('should return zero attachments without tenant context', async () => {
      const rows = await queryWithoutContext(async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`),
      );
      expect(rows).toHaveLength(0);
    });

    it('should allow reading memberships without context (no RLS on memberships)', async () => {
      // Memberships no longer have RLS — runtime_role can read all rows
      const rows = await queryWithoutContext(async (tx) =>
        tx.execute(sql`SELECT id FROM memberships WHERE id IN (${TEST_MEMBERSHIP_A}, ${TEST_MEMBERSHIP_B})`),
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---- Cross-tenant read isolation ----

  describe('Cross-tenant read isolation', () => {
    it('should see all organizations across tenants (no RLS on context entities)', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`SELECT id FROM organizations WHERE id IN (${TEST_ORG_A}, ${TEST_ORG_B})`),
      );
      const ids = rows.map((r) => r.id);
      // No RLS — both orgs visible
      expect(ids).toContain(TEST_ORG_A);
      expect(ids).toContain(TEST_ORG_B);
    });

    it('should see all organizations within own tenant', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`SELECT id FROM organizations WHERE tenant_id = ${TEST_TENANT_A}`),
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(TEST_ORG_A);
      expect(ids).toContain(TEST_ORG_C);
    });

    it('should see all pages across tenants (no RLS on pages)', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`SELECT id FROM pages WHERE id IN (${TEST_PAGE_A}, ${TEST_PAGE_B}, ${TEST_PAGE_PUBLIC})`),
      );
      // No RLS on pages — all pages visible regardless of tenant context
      expect(rows).toHaveLength(3);
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
    it('should allow inserting organization into any tenant (no RLS on context entities)', async () => {
      const fakeOrgId = '00000000-0000-4000-a000-000000000301';
      // No RLS on organizations — insert succeeds (guard middleware prevents this at API layer)
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
            INSERT INTO organizations (id, entity_type, tenant_id, name, slug, created_by, created_at)
            VALUES (${fakeOrgId}, 'organization', ${TEST_TENANT_B}, 'Fake Org', ${`rls-fake-${Date.now()}`}, ${TEST_USER_A}, NOW())
          `),
      );
      // Cleanup
      await adminDb.execute(sql`DELETE FROM organizations WHERE id = ${fakeOrgId}`);
    });

    it('should allow inserting page (no RLS on pages)', async () => {
      const fakePageId = '00000000-0000-4000-a000-000000000302';
      // No RLS on pages — insert succeeds (sysAdminGuard prevents this at API layer)
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
            INSERT INTO pages (id, entity_type, name, stx, keywords, created_by, display_order)
            VALUES (${fakePageId}, 'page', 'Fake Page', '{}', '', ${TEST_USER_A}, 99)
          `),
      );
      // Cleanup
      await adminDb.execute(sql`DELETE FROM pages WHERE id = ${fakePageId}`);
    });

    it('should allow inserting membership into any tenant (no RLS on memberships)', async () => {
      // No RLS on memberships — insert succeeds (guard middleware prevents this at API layer)
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
            INSERT INTO memberships (id, tenant_id, context_type, context_id, user_id, role, created_by, display_order, organization_id)
            VALUES ('00000000-0000-4000-a000-000000000303', ${TEST_TENANT_B}, 'organization', ${TEST_ORG_B}, ${TEST_USER_A}, 'member', ${TEST_USER_A}, 99, ${TEST_ORG_B})
          `),
      );
      // Cleanup
      await adminDb.execute(sql`DELETE FROM memberships WHERE id = '00000000-0000-4000-a000-000000000303'`);
    });

    it('should allow updating organizations in any tenant (no RLS, app-layer isolation)', async () => {
      // No RLS on organizations — update succeeds even cross-tenant
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`UPDATE organizations SET name = 'Updated Cross' WHERE id = ${TEST_ORG_B}`),
      );
      // Restore
      await adminDb.execute(sql`UPDATE organizations SET name = 'RLS Org B' WHERE id = ${TEST_ORG_B}`);
    });

    it('should allow deleting pages (no RLS on pages)', async () => {
      // Create a temp page to delete (don't delete test data)
      const tempPageId = '00000000-0000-4000-a000-000000000304';
      await adminDb.execute(sql`
        INSERT INTO pages (id, entity_type, name, stx, keywords, created_by, display_order)
        VALUES (${tempPageId}, 'page', 'Temp Delete Page', '{}', '', ${TEST_USER_B}, 99)
        ON CONFLICT (id) DO NOTHING
      `);
      // No RLS on pages — delete succeeds cross-tenant (sysAdminGuard prevents this at API layer)
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`DELETE FROM pages WHERE id = ${tempPageId}`),
      );
      const rows = getRows(await adminDb.execute(sql`SELECT id FROM pages WHERE id = ${tempPageId}`));
      expect(rows).toHaveLength(0);
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

    it('should see attachments in other orgs within same tenant at RLS level (org isolation is app-layer)', async () => {
      // User A can see Org C's attachment at the DB level — orgGuard prevents API access
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_C}`),
      );
      // RLS allows this (same tenant), orgGuard would block at API layer
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(TEST_ATTACHMENT_C);
    });

    it('should deny access to attachments without tenant context', async () => {
      const rows = await queryWithoutContext(async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id IN (${TEST_ATTACHMENT_A}, ${TEST_ATTACHMENT_C})`),
      );
      expect(rows).toHaveLength(0);
    });
  });

  // ---- Pages: no RLS (app-layer access control) ----

  describe('Pages (no RLS)', () => {
    it('should show all pages regardless of authentication status', async () => {
      // Pages have no RLS — access control is at the API layer (publicGuard for reads, sysAdminGuard for writes)
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, '', async (tx) =>
        tx.execute(sql`SELECT id FROM pages WHERE id IN (${TEST_PAGE_A}, ${TEST_PAGE_B}, ${TEST_PAGE_PUBLIC})`),
      );
      // All pages visible — no RLS filtering
      expect(rows).toHaveLength(3);
    });

    it('should show all pages across tenants to authenticated users', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`SELECT id FROM pages WHERE id IN (${TEST_PAGE_A}, ${TEST_PAGE_B}, ${TEST_PAGE_PUBLIC})`),
      );
      expect(rows).toHaveLength(3);
    });
  });

  // ---- Unauthenticated write denial ----

  describe('Unauthenticated write denial', () => {
    it('should allow page insert when unauthenticated (no RLS on pages)', async () => {
      const unauthPageId = '00000000-0000-4000-a000-000000000305';
      // No RLS on pages — insert succeeds (sysAdminGuard prevents this at API layer)
      await queryAsRuntimeRole(TEST_TENANT_A, '', async (tx) =>
        tx.execute(sql`
            INSERT INTO pages (id, entity_type, name, stx, keywords, display_order)
            VALUES (${unauthPageId}, 'page', 'Unauth Page', '{}', '', 99)
          `),
      );
      // Cleanup
      await adminDb.execute(sql`DELETE FROM pages WHERE id = ${unauthPageId}`);
    });

    it('should allow membership insert without authentication (no RLS on memberships)', async () => {
      // No RLS on memberships — insert succeeds. Guard middleware prevents this at API layer.
      // Use TEST_USER_B + TEST_ORG_A to avoid duplicate (tenant_id, user_id, context_id) with setup data.
      await queryAsRuntimeRole(TEST_TENANT_A, '', async (tx) =>
        tx.execute(sql`
            INSERT INTO memberships (id, tenant_id, context_type, context_id, user_id, role, created_by, display_order, organization_id)
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

    it('should allow inserting a task as runtime_role', async () => {
      const id = '00000000-0000-4000-a000-000000000101';
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
          INSERT INTO tasks (id, entity_type, tenant_id, name, stx, keywords, summary, variant, display_order, status, organization_id, project_id, created_by)
          VALUES (${id}, 'task', ${TEST_TENANT_A}, 'WT Task', '{}', '', '', 1, 99, 5, ${TEST_ORG_A}, ${TEST_PROJECT_A}, ${TEST_USER_A})
        `),
      );
      await adminDb.execute(sql`DELETE FROM tasks WHERE id = ${id}`);
    });

    it('should allow inserting an attachment as runtime_role', async () => {
      const id = '00000000-0000-4000-a000-000000000102';
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
          INSERT INTO attachments (id, entity_type, tenant_id, name, stx, keywords, created_by, organization_id, bucket_name, filename, content_type, size, original_key)
          VALUES (${id}, 'attachment', ${TEST_TENANT_A}, 'WT File', '{}', '', ${TEST_USER_A}, ${TEST_ORG_A}, 'test-bucket', 'wt.txt', 'text/plain', '100', 'attachments/wt.txt')
        `),
      );
      await adminDb.execute(sql`DELETE FROM attachments WHERE id = ${id}`);
    });

    it('should allow inserting a label as runtime_role', async () => {
      const id = '00000000-0000-4000-a000-000000000103';
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
          INSERT INTO labels (id, entity_type, tenant_id, name, stx, keywords, organization_id, project_id, created_by)
          VALUES (${id}, 'label', ${TEST_TENANT_A}, 'WT Label', '{}', '', ${TEST_ORG_A}, ${TEST_PROJECT_A}, ${TEST_USER_A})
        `),
      );
      await adminDb.execute(sql`DELETE FROM labels WHERE id = ${id}`);
    });

    it('should allow inserting a yjs_document as runtime_role', async () => {
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`
          INSERT INTO yjs_documents (entity_type, entity_id, tenant_id, organization_id, state)
          VALUES ('task', ${TEST_TASK_A}, ${TEST_TENANT_A}, ${TEST_ORG_A}, '\\x00')
          ON CONFLICT (entity_type, entity_id) DO NOTHING
        `),
      );
      await adminDb.execute(sql`DELETE FROM yjs_documents WHERE entity_id = ${TEST_TASK_A}`);
    });

    it('should allow updating a task as runtime_role', async () => {
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`UPDATE tasks SET name = 'Updated Task' WHERE id = ${TEST_TASK_A}`),
      );
      // Restore
      await adminDb.execute(sql`UPDATE tasks SET name = 'RLS Task A' WHERE id = ${TEST_TASK_A}`);
    });

    it('should allow updating an attachment as runtime_role', async () => {
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`UPDATE attachments SET name = 'Updated File' WHERE id = ${TEST_ATTACHMENT_A}`),
      );
      await adminDb.execute(sql`UPDATE attachments SET name = 'Test File' WHERE id = ${TEST_ATTACHMENT_A}`);
    });

    it('should allow updating a label as runtime_role', async () => {
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`UPDATE labels SET name = 'Updated Label' WHERE id = ${TEST_LABEL_A}`),
      );
      await adminDb.execute(sql`UPDATE labels SET name = 'RLS Label A' WHERE id = ${TEST_LABEL_A}`);
    });

    it('should allow deleting a task as runtime_role', async () => {
      const id = '00000000-0000-4000-a000-000000000104';
      await adminDb.execute(sql`
        INSERT INTO tasks (id, entity_type, tenant_id, name, stx, keywords, summary, variant, display_order, status, organization_id, project_id, created_by)
        VALUES (${id}, 'task', ${TEST_TENANT_A}, 'Del Task', '{}', '', '', 1, 98, 5, ${TEST_ORG_A}, ${TEST_PROJECT_A}, ${TEST_USER_A})
        ON CONFLICT (id) DO NOTHING
      `);
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, async (tx) =>
        tx.execute(sql`DELETE FROM tasks WHERE id = ${id}`),
      );
      const rows = getRows(await adminDb.execute(sql`SELECT id FROM tasks WHERE id = ${id}`));
      expect(rows).toHaveLength(0);
    });

    it('should allow writing without tenant context (write-through is unconditional)', async () => {
      const id = '00000000-0000-4000-a000-000000000105';
      // Write without any session context — write-through policy uses sql`true`
      await queryWithoutContext(async (tx) =>
        tx.execute(sql`
          INSERT INTO attachments (id, entity_type, tenant_id, name, stx, keywords, created_by, organization_id, bucket_name, filename, content_type, size, original_key)
          VALUES (${id}, 'attachment', ${TEST_TENANT_A}, 'No Context File', '{}', '', ${TEST_USER_A}, ${TEST_ORG_A}, 'test-bucket', 'nc.txt', 'text/plain', '50', 'attachments/nc.txt')
        `),
      );
      // SELECT without context should still be denied (fail-closed read)
      const rows = await queryWithoutContext(async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${id}`),
      );
      expect(rows).toHaveLength(0);
      // Cleanup
      await adminDb.execute(sql`DELETE FROM attachments WHERE id = ${id}`);
    });
  });

  // ---- Composite FK violation (tenant_id must match organization's tenant_id) ----

  describe('Composite foreign key enforcement', () => {
    it('should reject inserting a task with mismatched tenant_id / organization_id', async () => {
      // Org A belongs to Tenant A — inserting with Tenant B should violate composite FK
      await expect(
        unwrapDrizzle(
          adminDb.execute(sql`
          INSERT INTO tasks (id, entity_type, tenant_id, name, stx, keywords, summary, variant, display_order, status, organization_id, project_id, created_by)
          VALUES ('00000000-0000-4000-a000-000000000201', 'task', ${TEST_TENANT_B}, 'FK Task', '{}', '', '', 1, 99, 5, ${TEST_ORG_A}, ${TEST_PROJECT_A}, ${TEST_USER_A})
        `),
        ),
      ).rejects.toThrow(/foreign key|violates/i);
    });

    it('should reject inserting a label with mismatched tenant_id / organization_id', async () => {
      await expect(
        unwrapDrizzle(
          adminDb.execute(sql`
          INSERT INTO labels (id, entity_type, tenant_id, name, stx, keywords, organization_id, project_id, created_by)
          VALUES ('00000000-0000-4000-a000-000000000202', 'label', ${TEST_TENANT_B}, 'FK Label', '{}', '', ${TEST_ORG_A}, ${TEST_PROJECT_A}, ${TEST_USER_A})
        `),
        ),
      ).rejects.toThrow(/foreign key|violates/i);
    });

    it('should reject inserting an attachment with mismatched tenant_id / organization_id', async () => {
      await expect(
        unwrapDrizzle(
          adminDb.execute(sql`
          INSERT INTO attachments (id, entity_type, tenant_id, name, stx, keywords, created_by, organization_id, bucket_name, filename, content_type, size, original_key)
          VALUES ('00000000-0000-4000-a000-000000000203', 'attachment', ${TEST_TENANT_B}, 'FK File', '{}', '', ${TEST_USER_A}, ${TEST_ORG_A}, 'test-bucket', 'fk.txt', 'text/plain', '10', 'attachments/fk.txt')
        `),
        ),
      ).rejects.toThrow(/foreign key|violates/i);
    });

    it('should allow inserting with matching tenant_id / organization_id', async () => {
      const id = '00000000-0000-4000-a000-000000000204';
      await expect(
        adminDb.execute(sql`
          INSERT INTO tasks (id, entity_type, tenant_id, name, stx, keywords, summary, variant, display_order, status, organization_id, project_id, created_by)
          VALUES (${id}, 'task', ${TEST_TENANT_A}, 'FK Valid', '{}', '', '', 1, 97, 5, ${TEST_ORG_A}, ${TEST_PROJECT_A}, ${TEST_USER_A})
          ON CONFLICT (id) DO NOTHING
        `),
      ).resolves.not.toThrow();
      // Cleanup
      await adminDb.execute(sql`DELETE FROM tasks WHERE id = ${id}`);
    });
  });

  // ---- Immutability triggers (apply regardless of role) ----
  // Data-driven: covers all entity/column combinations from config

  describe('Immutability triggers', () => {
    // Base entity columns (shared by context + parentless product entities)
    const baseImmutableColumns = ['id', 'tenant_id', 'entity_type', 'created_at', 'created_by'];

    // Context entities: use base columns
    const contextCases: [string, string, string][] = appConfig.contextEntityTypes.flatMap((entityType) => {
      const tableName = getTableName(entityTables[entityType as keyof typeof entityTables]);
      return baseImmutableColumns.map((col) => [tableName, col, entityType] as [string, string, string]);
    });

    // Org-scoped product entities: base + organization_id
    const orgProductCases: [string, string, string][] = appConfig.productEntityTypes
      .filter((t) => !parentlessTypes.has(t))
      .flatMap((entityType) => {
        const tableName = getTableName(entityTables[entityType as keyof typeof entityTables]);
        return [...baseImmutableColumns, 'organization_id'].map(
          (col) => [tableName, col, entityType] as [string, string, string],
        );
      });

    // Parentless product entities: no tenant_id column
    const parentlessImmutableColumns = ['id', 'entity_type', 'created_at', 'created_by'];
    const parentlessCases: [string, string, string][] = hierarchy.parentlessProductTypes.flatMap((entityType) => {
      const tableName = getTableName(entityTables[entityType as keyof typeof entityTables]);
      return parentlessImmutableColumns.map((col) => [tableName, col, entityType] as [string, string, string]);
    });

    // Membership columns
    const membershipCases: [string, string][] = [
      'tenant_id',
      'organization_id',
      'context_id',
      'context_type',
      'user_id',
    ].map((col) => ['memberships', col]);

    const allEntityCases = [...contextCases, ...orgProductCases, ...parentlessCases];

    // Type-appropriate fake values per column type so Postgres doesn't reject the type cast before the trigger fires
    const fakeValueForColumn = (column: string): string => {
      if (column === 'created_at') return "'2000-01-01T00:00:00Z'";
      if (column === 'entity_type' || column === 'tenant_id') return "'hacked'";
      // uuid columns: id, created_by, organization_id
      return "'00000000-0000-4000-a000-ffffffffffff'";
    };

    it.each(allEntityCases)('should reject %s.%s mutation (%s)', async (tableName, column) => {
      // Attempt to modify an immutable column — trigger should raise exception
      await expect(
        unwrapDrizzle(
          adminDb.execute(sql.raw(`UPDATE ${tableName} SET ${column} = ${fakeValueForColumn(column)} WHERE 1=1`)),
        ),
      ).rejects.toThrow(/immutable/i);
    });

    it.each(membershipCases)('should reject %s.%s mutation', async (tableName, column) => {
      const fakeValue = ['tenant_id', 'context_type'].includes(column)
        ? "'hacked'"
        : "'00000000-0000-4000-a000-ffffffffffff'";
      await expect(
        unwrapDrizzle(adminDb.execute(sql.raw(`UPDATE ${tableName} SET ${column} = ${fakeValue} WHERE 1=1`))),
      ).rejects.toThrow(/immutable/i);
    });

    it('should reject updates on append-only activities table', async () => {
      // The activities table is append-only — all updates are rejected
      await expect(
        unwrapDrizzle(adminDb.execute(sql.raw("UPDATE activities SET id = 'hacked' WHERE 1=1"))),
      ).rejects.toThrow(/append.only|immutable/i);
    });

    it('should allow updating non-immutable columns', async () => {
      // name is mutable — should succeed
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
  // every row and the UPDATE silently affects 0 rows — counters then advance
  // while row.seq stays at 0, breaking the sync engine.
  describe('CDC seq stamping (admin_role under FORCE RLS)', () => {
    let adminRoleDb: NodePgDatabase;

    beforeAll(async () => {
      if (!rolesAvailable) return;
      const ADMIN_ROLE_DB_URL = 'postgres://admin_role:dev_password@0.0.0.0:5434/postgres';
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

    it('admin_role can UPDATE seq on a task row without tenant context', async () => {
      // Read current seq (admin connection, no app.tenant_id set anywhere)
      const before = getRows<{ seq: string | number }>(
        await adminRoleDb.execute(sql`SELECT seq FROM tasks WHERE id = ${TEST_TASK_A}`),
      );
      expect(before, 'admin_role must see the task row (BYPASSRLS)').toHaveLength(1);

      // bigint columns come back as strings from node-pg; coerce
      const newSeq = Number(before[0].seq ?? 0) + 1;
      const updateResult = await adminRoleDb.execute(
        sql`UPDATE tasks SET seq = ${newSeq}, stx = stx - 'changedFields' WHERE id = ${TEST_TASK_A}`,
      );

      // node-pg returns rowCount; the regression bug manifests as 0 here
      expect((updateResult as { rowCount?: number }).rowCount, 'UPDATE must affect the row, not silently no-op').toBe(
        1,
      );

      const after = getRows<{ seq: string | number }>(
        await adminDb.execute(sql`SELECT seq FROM tasks WHERE id = ${TEST_TASK_A}`),
      );
      expect(Number(after[0].seq)).toBe(newSeq);
    });
  });
});
