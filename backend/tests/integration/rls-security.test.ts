/**
 * RLS security regression tests.
 *
 * These tests verify that Row-Level Security policies correctly
 * isolate tenant data and prevent unauthorized access.
 *
 * IMPORTANT: These tests require PostgreSQL with RLS roles configured.
 * Run with `pnpm test:full` (not test:basic or test:core).
 *
 * Architecture:
 * - `adminDb` (postgres superuser): Setup/cleanup, bypasses RLS
 * - `runtimeDb` (runtime_role): Subject to RLS policies, used for assertions
 * - Session variables (app.tenant_id, app.user_id, app.is_authenticated)
 *   are set via set_config() within transactions to drive RLS policy evaluation
 *
 * @see info/RLS.md for full architecture documentation
 */

import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unsafeInternalDb as adminDb } from '#/db/db';
import { setPublicRlsContext, setTenantRlsContext, setUserRlsContext } from '#/db/tenant-context';
import { nanoidTenant } from '#/utils/nanoid';

// Test IDs - deterministic for reliable cleanup
const TEST_TENANT_A = 'rlsta1';
const TEST_TENANT_B = 'rlsta2';
const TEST_USER_A = 'rls_test_user_a_001';
const TEST_USER_B = 'rls_test_user_b_001';
const TEST_ORG_A = 'rls_test_org_a_001';
const TEST_ORG_B = 'rls_test_org_b_001';
const TEST_MEMBERSHIP_A = 'rls_test_mem_a_001';
const TEST_MEMBERSHIP_B = 'rls_test_mem_b_001';
const TEST_PAGE_A = 'rls_test_page_a_001';
const TEST_PAGE_B = 'rls_test_page_b_001';
const TEST_PAGE_PUBLIC = 'rls_test_page_pub_001';
const TEST_ATTACHMENT_A = 'rls_test_att_a_001';

// Runtime role connection (subject to RLS)
const RUNTIME_DB_URL = 'postgres://runtime_role:dev_password@0.0.0.0:5434/postgres';
let runtimeDb: NodePgDatabase;

/** Whether runtime_role exists in the test database */
let rolesAvailable = false;

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

      -- Table ownership and FORCE RLS
      ALTER TABLE organizations OWNER TO admin_role;
      ALTER TABLE attachments OWNER TO admin_role;
      ALTER TABLE pages OWNER TO admin_role;
      ALTER TABLE memberships OWNER TO admin_role;
      ALTER TABLE inactive_memberships OWNER TO admin_role;
      
      ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
      ALTER TABLE attachments FORCE ROW LEVEL SECURITY;
      ALTER TABLE pages FORCE ROW LEVEL SECURITY;
      ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
      ALTER TABLE inactive_memberships FORCE ROW LEVEL SECURITY;

      -- Grants for runtime_role
      GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO runtime_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON attachments TO runtime_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON pages TO runtime_role;
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
    INSERT INTO tenants (id, name, status, created_at, modified_at)
    VALUES
      (${TEST_TENANT_A}, 'RLS Test Tenant A', 'active', NOW(), NOW()),
      (${TEST_TENANT_B}, 'RLS Test Tenant B', 'active', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Create test users
  await adminDb.execute(sql`
    INSERT INTO users (id, entity_type, name, slug, email, created_at)
    VALUES
      (${TEST_USER_A}, 'user', 'RLS User A', ${'rls-user-a-' + Date.now()}, ${'rls-a-' + Date.now() + '@test.com'}, NOW()),
      (${TEST_USER_B}, 'user', 'RLS User B', ${'rls-user-b-' + Date.now()}, ${'rls-b-' + Date.now() + '@test.com'}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Create orgs in each tenant
  await adminDb.execute(sql`
    INSERT INTO organizations (id, entity_type, tenant_id, name, slug, created_by, created_at)
    VALUES
      (${TEST_ORG_A}, 'organization', ${TEST_TENANT_A}, 'RLS Org A', ${'rls-org-a-' + Date.now()}, ${TEST_USER_A}, NOW()),
      (${TEST_ORG_B}, 'organization', ${TEST_TENANT_B}, 'RLS Org B', ${'rls-org-b-' + Date.now()}, ${TEST_USER_B}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  // Create memberships: User A in Org A (Tenant A), User B in Org B (Tenant B)
  await adminDb.execute(sql`
    INSERT INTO memberships (id, tenant_id, context_type, user_id, role, created_by, display_order, organization_id)
    VALUES
      (${TEST_MEMBERSHIP_A}, ${TEST_TENANT_A}, 'organization', ${TEST_USER_A}, 'admin', ${TEST_USER_A}, 1, ${TEST_ORG_A}),
      (${TEST_MEMBERSHIP_B}, ${TEST_TENANT_B}, 'organization', ${TEST_USER_B}, 'admin', ${TEST_USER_B}, 1, ${TEST_ORG_B})
    ON CONFLICT (id) DO NOTHING
  `);

  // Create pages: private page in each tenant + one public page in Tenant A
  await adminDb.execute(sql`
    INSERT INTO pages (id, entity_type, tenant_id, name, stx, keywords, created_by, display_order, public_access)
    VALUES
      (${TEST_PAGE_A}, 'page', ${TEST_TENANT_A}, 'Private Page A', '{}', '', ${TEST_USER_A}, 1, false),
      (${TEST_PAGE_B}, 'page', ${TEST_TENANT_B}, 'Private Page B', '{}', '', ${TEST_USER_B}, 1, false),
      (${TEST_PAGE_PUBLIC}, 'page', ${TEST_TENANT_A}, 'Public Page A', '{}', '', ${TEST_USER_A}, 2, true)
    ON CONFLICT (id) DO NOTHING
  `);

  // Create attachment in Org A (Tenant A) — requires membership to see
  await adminDb.execute(sql`
    INSERT INTO attachments (id, entity_type, tenant_id, name, stx, keywords, created_by, organization_id, bucket_name, filename, content_type, size, original_key)
    VALUES
      (${TEST_ATTACHMENT_A}, 'attachment', ${TEST_TENANT_A}, 'Test File', '{}', '', ${TEST_USER_A}, ${TEST_ORG_A}, 'test-bucket', 'test.txt', 'text/plain', '1024', 'attachments/test.txt')
    ON CONFLICT (id) DO NOTHING
  `);
}

/**
 * Cleanup all test data (reverse order of creation due to FKs).
 */
async function cleanupTestData() {
  await adminDb.execute(sql`DELETE FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`);
  await adminDb.execute(sql`DELETE FROM pages WHERE id IN (${TEST_PAGE_A}, ${TEST_PAGE_B}, ${TEST_PAGE_PUBLIC})`);
  await adminDb.execute(sql`DELETE FROM memberships WHERE id IN (${TEST_MEMBERSHIP_A}, ${TEST_MEMBERSHIP_B})`);
  await adminDb.execute(sql`DELETE FROM organizations WHERE id IN (${TEST_ORG_A}, ${TEST_ORG_B})`);
  await adminDb.execute(sql`DELETE FROM users WHERE id IN (${TEST_USER_A}, ${TEST_USER_B})`);
  await adminDb.execute(sql`DELETE FROM tenants WHERE id IN (${TEST_TENANT_A}, ${TEST_TENANT_B})`);
}

/**
 * Normalize drizzle execute() results to a plain array of rows.
 * node-postgres returns QueryResult (with .rows), PgAsyncDatabase may return array-like.
 */
// biome-ignore lint/suspicious/noExplicitAny: Drizzle returns different shapes per driver
function getRows<T = Record<string, unknown>>(result: any): T[] {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

/**
 * Helper: Execute a query as runtime_role with RLS session variables.
 * Returns rows array from an RLS-subject connection.
 */
async function queryAsRuntimeRole<T = Record<string, unknown>>(
  tenantId: string,
  userId: string,
  isAuthenticated: boolean,
  queryFn: (tx: NodePgDatabase) => Promise<unknown>,
): Promise<T[]> {
  return runtimeDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.is_authenticated', ${String(isAuthenticated)}, true)`);
    const result = await queryFn(tx as unknown as NodePgDatabase);
    return getRows<T>(result);
  });
}

/**
 * Helper: Execute a query as runtime_role WITHOUT any session context.
 * Used to verify fail-closed behavior (no context → zero rows).
 */
async function queryWithoutContext<T = Record<string, unknown>>(
  queryFn: (tx: NodePgDatabase) => Promise<unknown>,
): Promise<T[]> {
  return runtimeDb.transaction(async (tx) => {
    // Explicitly clear any lingering context
    await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.is_authenticated', 'false', true)`);
    const result = await queryFn(tx as unknown as NodePgDatabase);
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
        INSERT INTO tenants (id, name, status, created_at, modified_at)
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
      await setTenantRlsContext({ tenantId: TEST_TENANT_A, userId: TEST_USER_A }, async (tx) => {
        const tenantRows = getRows<{ value: string }>(
          await tx.execute(sql`SELECT current_setting('app.tenant_id', true) as value`),
        );
        const userRows = getRows<{ value: string }>(
          await tx.execute(sql`SELECT current_setting('app.user_id', true) as value`),
        );
        const authRows = getRows<{ value: string }>(
          await tx.execute(sql`SELECT current_setting('app.is_authenticated', true) as value`),
        );

        expect(tenantRows[0].value).toBe(TEST_TENANT_A);
        expect(userRows[0].value).toBe(TEST_USER_A);
        expect(authRows[0].value).toBe('true');
      });
    });

    it('should clear session variables after transaction', async () => {
      await setTenantRlsContext({ tenantId: TEST_TENANT_A, userId: TEST_USER_A }, async () => {
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
      await setUserRlsContext({ userId: TEST_USER_A }, async (tx) => {
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

    it('should set unauthenticated flag in public context', async () => {
      await setPublicRlsContext(TEST_TENANT_A, async (tx) => {
        const tenantRows = getRows<{ value: string }>(
          await tx.execute(sql`SELECT current_setting('app.tenant_id', true) as value`),
        );
        const authRows = getRows<{ value: string }>(
          await tx.execute(sql`SELECT current_setting('app.is_authenticated', true) as value`),
        );

        expect(tenantRows[0].value).toBe(TEST_TENANT_A);
        expect(authRows[0].value).toBe('false');
      });
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

    it('should never generate reserved "public" ID', () => {
      // Generate many IDs and verify none are "public"
      const ids = Array.from({ length: 1000 }, () => nanoidTenant());
      expect(ids.every((id) => id !== 'public')).toBe(true);
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
      casing: 'snake_case',
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
    it('should return zero organizations without tenant context', async () => {
      const rows = await queryWithoutContext(async (tx) =>
        tx.execute(sql`SELECT id FROM organizations WHERE id IN (${TEST_ORG_A}, ${TEST_ORG_B})`),
      );
      expect(rows).toHaveLength(0);
    });

    it('should return zero non-public pages without tenant context', async () => {
      const rows = await queryWithoutContext(async (tx) =>
        tx.execute(sql`SELECT id FROM pages WHERE id IN (${TEST_PAGE_A}, ${TEST_PAGE_B})`),
      );
      // Private pages require tenant context — should be invisible
      expect(rows).toHaveLength(0);
    });

    it('should expose public_access pages without context (by design)', async () => {
      // Pages with public_access=true are intentionally visible globally — even without
      // tenant context. In the Cella template, pages use a dummy tenant and are always
      // public, so this cross-tenant visibility is the expected behavior.
      const rows = await queryWithoutContext(async (tx) =>
        tx.execute(sql`SELECT id FROM pages WHERE id = ${TEST_PAGE_PUBLIC}`),
      );
      expect(rows).toHaveLength(1);
    });

    it('should return zero attachments without tenant context', async () => {
      const rows = await queryWithoutContext(async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`),
      );
      expect(rows).toHaveLength(0);
    });

    it('should return zero memberships without any context (restrictive guard)', async () => {
      // memberships_context_guard: RESTRICTIVE — needs tenant_id OR user_id set
      const rows = await queryWithoutContext(async (tx) =>
        tx.execute(sql`SELECT id FROM memberships WHERE id IN (${TEST_MEMBERSHIP_A}, ${TEST_MEMBERSHIP_B})`),
      );
      expect(rows).toHaveLength(0);
    });
  });

  // ---- Cross-tenant read isolation ----

  describe('Cross-tenant read isolation', () => {
    it('should only see own tenant organizations', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, true, async (tx) =>
        tx.execute(sql`SELECT id FROM organizations WHERE id IN (${TEST_ORG_A}, ${TEST_ORG_B})`),
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(TEST_ORG_A);
      expect(ids).not.toContain(TEST_ORG_B);
    });

    it('should only see own tenant pages', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, true, async (tx) =>
        tx.execute(sql`SELECT id FROM pages WHERE id IN (${TEST_PAGE_A}, ${TEST_PAGE_B}, ${TEST_PAGE_PUBLIC})`),
      );
      const ids = rows.map((r) => r.id);
      // Should see Tenant A pages (private and public)
      expect(ids).toContain(TEST_PAGE_A);
      expect(ids).toContain(TEST_PAGE_PUBLIC);
      // Should NOT see Tenant B pages
      expect(ids).not.toContain(TEST_PAGE_B);
    });

    it('should only see own tenant memberships (via tenant context)', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, true, async (tx) =>
        tx.execute(sql`SELECT id FROM memberships WHERE id IN (${TEST_MEMBERSHIP_A}, ${TEST_MEMBERSHIP_B})`),
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(TEST_MEMBERSHIP_A);
      expect(ids).not.toContain(TEST_MEMBERSHIP_B);
    });

    it('should see own memberships across tenants (via user context)', async () => {
      // User context (no tenant) — cross-tenant read by user_id
      const rows = await queryAsRuntimeRole<{ id: string }>('', TEST_USER_A, true, async (tx) =>
        tx.execute(sql`SELECT id FROM memberships WHERE user_id = ${TEST_USER_A}`),
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(TEST_MEMBERSHIP_A);
      // Should NOT see User B's memberships
      expect(ids).not.toContain(TEST_MEMBERSHIP_B);
    });
  });

  // ---- Cross-tenant write isolation ----

  describe('Cross-tenant write isolation', () => {
    it('should deny inserting organization into wrong tenant', async () => {
      const fakeOrgId = 'rls_fake_org_001';
      // Authenticated as Tenant A user, trying to insert into Tenant B
      await expect(
        queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, true, async (tx) =>
          tx.execute(sql`
            INSERT INTO organizations (id, entity_type, tenant_id, name, slug, created_by, created_at)
            VALUES (${fakeOrgId}, 'organization', ${TEST_TENANT_B}, 'Fake Org', ${'rls-fake-' + Date.now()}, ${TEST_USER_A}, NOW())
          `),
        ),
      ).rejects.toThrow(); // RLS check violation
    });

    it('should deny inserting page into wrong tenant', async () => {
      await expect(
        queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, true, async (tx) =>
          tx.execute(sql`
            INSERT INTO pages (id, entity_type, tenant_id, name, stx, keywords, created_by, display_order)
            VALUES ('rls_fake_page', 'page', ${TEST_TENANT_B}, 'Fake Page', '{}', '', ${TEST_USER_A}, 99)
          `),
        ),
      ).rejects.toThrow();
    });

    it('should deny inserting membership into wrong tenant', async () => {
      await expect(
        queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, true, async (tx) =>
          tx.execute(sql`
            INSERT INTO memberships (id, tenant_id, context_type, user_id, role, created_by, display_order, organization_id)
            VALUES ('rls_fake_mem', ${TEST_TENANT_B}, 'organization', ${TEST_USER_A}, 'member', ${TEST_USER_A}, 99, ${TEST_ORG_B})
          `),
        ),
      ).rejects.toThrow();
    });

    it('should deny updating organizations in wrong tenant', async () => {
      // User A (Tenant A) tries to update Org B (Tenant B)
      // With RLS, the UPDATE should affect 0 rows (org is invisible)
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, true, async (tx) =>
        tx.execute(sql`UPDATE organizations SET name = 'Hacked' WHERE id = ${TEST_ORG_B}`),
      );
      // RLS silently filters — 0 rows affected. Verify data unchanged:
      const rows = getRows<{ name: string }>(
        await adminDb.execute(sql`SELECT name FROM organizations WHERE id = ${TEST_ORG_B}`),
      );
      expect(rows[0].name).toBe('RLS Org B');
    });

    it('should deny deleting pages in wrong tenant', async () => {
      // User A tries to delete Tenant B's page — RLS makes it invisible
      await queryAsRuntimeRole(TEST_TENANT_A, TEST_USER_A, true, async (tx) =>
        tx.execute(sql`DELETE FROM pages WHERE id = ${TEST_PAGE_B}`),
      );
      // Verify page still exists (use admin connection)
      const rows = getRows(await adminDb.execute(sql`SELECT id FROM pages WHERE id = ${TEST_PAGE_B}`));
      expect(rows).toHaveLength(1);
    });
  });

  // ---- Organization membership enforcement ----

  describe('Organization membership enforcement', () => {
    it('should deny access to attachments without org membership', async () => {
      // User B (Tenant B) should not see Tenant A's attachment
      const rows = await queryAsRuntimeRole(TEST_TENANT_B, TEST_USER_B, true, async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`),
      );
      expect(rows).toHaveLength(0);
    });

    it('should allow access to attachments with org membership', async () => {
      // User A (Tenant A, member of Org A) should see the attachment
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, true, async (tx) =>
        tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(TEST_ATTACHMENT_A);
    });

    it('should deny access to attachments for user in same tenant without org membership', async () => {
      // Create a second user in Tenant A but without Org A membership
      const noMemberUser = 'rls_no_member_001';
      await adminDb.execute(sql`
        INSERT INTO users (id, entity_type, name, slug, email, created_at)
        VALUES (${noMemberUser}, 'user', 'No Member User', ${'rls-nomem-' + Date.now()}, ${'rls-nomem-' + Date.now() + '@test.com'}, NOW())
        ON CONFLICT (id) DO NOTHING
      `);

      try {
        const rows = await queryAsRuntimeRole(TEST_TENANT_A, noMemberUser, true, async (tx) =>
          tx.execute(sql`SELECT id FROM attachments WHERE id = ${TEST_ATTACHMENT_A}`),
        );
        // Same tenant, but no org membership → no access
        expect(rows).toHaveLength(0);
      } finally {
        await adminDb.execute(sql`DELETE FROM users WHERE id = ${noMemberUser}`);
      }
    });
  });

  // ---- Public content visibility ----

  describe('Public content visibility', () => {
    it('should show public pages to unauthenticated users with tenant context', async () => {
      // Public context: tenant set, is_authenticated=false
      const rows = await queryAsRuntimeRole<{ id: string; public_access: boolean }>(
        TEST_TENANT_A,
        '',
        false,
        async (tx) =>
          tx.execute(sql`SELECT id, public_access FROM pages WHERE id IN (${TEST_PAGE_A}, ${TEST_PAGE_PUBLIC})`),
      );
      const ids = rows.map((r) => r.id);
      // Should see ONLY the public page
      expect(ids).toContain(TEST_PAGE_PUBLIC);
      expect(ids).not.toContain(TEST_PAGE_A);
    });

    it('should show all tenant pages to authenticated users', async () => {
      const rows = await queryAsRuntimeRole<{ id: string }>(TEST_TENANT_A, TEST_USER_A, true, async (tx) =>
        tx.execute(sql`SELECT id FROM pages WHERE id IN (${TEST_PAGE_A}, ${TEST_PAGE_PUBLIC})`),
      );
      const ids = rows.map((r) => r.id);
      // Authenticated: sees both private and public
      expect(ids).toContain(TEST_PAGE_A);
      expect(ids).toContain(TEST_PAGE_PUBLIC);
    });

    it('should show public pages from other tenants (by design)', async () => {
      // Public pages are intentionally visible across tenant boundaries. In the Cella
      // template, pages use a dummy tenant and are always public, so global visibility
      // is expected behavior rather than a policy bug.
      const rows = await queryAsRuntimeRole(TEST_TENANT_B, '', false, async (tx) =>
        tx.execute(sql`SELECT id FROM pages WHERE id = ${TEST_PAGE_PUBLIC}`),
      );
      // Documenting actual behavior — public page is visible cross-tenant
      expect(rows).toHaveLength(1);
    });
  });

  // ---- Unauthenticated write denial ----

  describe('Unauthenticated write denial', () => {
    it('should deny page insert when unauthenticated', async () => {
      await expect(
        queryAsRuntimeRole(TEST_TENANT_A, '', false, async (tx) =>
          tx.execute(sql`
            INSERT INTO pages (id, entity_type, tenant_id, name, stx, keywords, display_order)
            VALUES ('rls_unauth_page', 'page', ${TEST_TENANT_A}, 'Unauth Page', '{}', '', 99)
          `),
        ),
      ).rejects.toThrow();
    });

    it('should deny membership insert when unauthenticated', async () => {
      await expect(
        queryAsRuntimeRole(TEST_TENANT_A, '', false, async (tx) =>
          tx.execute(sql`
            INSERT INTO memberships (id, tenant_id, context_type, user_id, role, created_by, display_order, organization_id)
            VALUES ('rls_unauth_mem', ${TEST_TENANT_A}, 'organization', ${TEST_USER_A}, 'member', ${TEST_USER_A}, 99, ${TEST_ORG_A})
          `),
        ),
      ).rejects.toThrow();
    });
  });

  // ---- Immutability triggers (apply regardless of role) ----

  describe('Immutability triggers', () => {
    it('should reject tenant_id update on organizations', async () => {
      await expect(
        adminDb.execute(sql`UPDATE organizations SET tenant_id = ${TEST_TENANT_B} WHERE id = ${TEST_ORG_A}`),
      ).rejects.toThrow();
    });

    it('should reject id update on organizations', async () => {
      await expect(
        adminDb.execute(sql`UPDATE organizations SET id = 'hacked_id' WHERE id = ${TEST_ORG_A}`),
      ).rejects.toThrow();
    });

    it('should reject entity_type update on organizations', async () => {
      await expect(
        adminDb.execute(sql`UPDATE organizations SET entity_type = 'hacked' WHERE id = ${TEST_ORG_A}`),
      ).rejects.toThrow();
    });

    it('should reject organization_id update on attachments (product entity)', async () => {
      await expect(
        adminDb.execute(sql`UPDATE attachments SET organization_id = ${TEST_ORG_B} WHERE id = ${TEST_ATTACHMENT_A}`),
      ).rejects.toThrow();
    });

    it('should reject tenant_id update on attachments', async () => {
      await expect(
        adminDb.execute(sql`UPDATE attachments SET tenant_id = ${TEST_TENANT_B} WHERE id = ${TEST_ATTACHMENT_A}`),
      ).rejects.toThrow();
    });

    it('should reject tenant_id update on memberships', async () => {
      await expect(
        adminDb.execute(sql`UPDATE memberships SET tenant_id = ${TEST_TENANT_B} WHERE id = ${TEST_MEMBERSHIP_A}`),
      ).rejects.toThrow();
    });

    it('should reject user_id update on memberships', async () => {
      await expect(
        adminDb.execute(sql`UPDATE memberships SET user_id = ${TEST_USER_B} WHERE id = ${TEST_MEMBERSHIP_A}`),
      ).rejects.toThrow();
    });

    it('should reject organization_id update on memberships', async () => {
      await expect(
        adminDb.execute(sql`UPDATE memberships SET organization_id = ${TEST_ORG_B} WHERE id = ${TEST_MEMBERSHIP_A}`),
      ).rejects.toThrow();
    });

    it('should reject tenant_id update on pages', async () => {
      await expect(
        adminDb.execute(sql`UPDATE pages SET tenant_id = ${TEST_TENANT_B} WHERE id = ${TEST_PAGE_A}`),
      ).rejects.toThrow();
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
});
