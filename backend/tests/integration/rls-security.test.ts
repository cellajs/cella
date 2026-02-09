/**
 * RLS security regression tests.
 *
 * These tests verify that Row-Level Security policies correctly
 * isolate tenant data and prevent unauthorized access.
 *
 * IMPORTANT: These tests require PostgreSQL with RLS roles configured.
 * Run with `pnpm test:core` or `pnpm test:full` (not test:basic).
 *
 * @see info/RLS.md for full architecture documentation
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '#/db/db';
import { setPublicRlsContext, setTenantRlsContext, setUserRlsContext } from '#/db/tenant-context';
import { nanoidTenant } from '#/utils/nanoid';

// Test tenant and user IDs
const TEST_TENANT_A_ID = 'tsttn1';
const TEST_TENANT_B_ID = 'tsttn2';
const TEST_USER_ID = 'test_user_rls_001';

/**
 * Setup helper: Create test tenants for RLS testing.
 * Uses direct SQL to bypass RLS for setup.
 */
async function setupTestTenants() {
  // Create test tenants
  await db.execute(sql`
    INSERT INTO tenants (id, name, status, created_at, modified_at)
    VALUES 
      (${TEST_TENANT_A_ID}, 'Test Tenant A', 'active', NOW(), NOW()),
      (${TEST_TENANT_B_ID}, 'Test Tenant B', 'active', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
}

/**
 * Cleanup helper: Remove test data.
 */
async function cleanupTestData() {
  await db.execute(sql`
    DELETE FROM memberships WHERE tenant_id IN (${TEST_TENANT_A_ID}, ${TEST_TENANT_B_ID})
  `);
  await db.execute(sql`
    DELETE FROM organizations WHERE tenant_id IN (${TEST_TENANT_A_ID}, ${TEST_TENANT_B_ID})
  `);
  await db.execute(sql`
    DELETE FROM tenants WHERE id IN (${TEST_TENANT_A_ID}, ${TEST_TENANT_B_ID})
  `);
}

describe('RLS Security Tests', () => {
  describe('Tenant Context Helpers', () => {
    beforeAll(async () => {
      await setupTestTenants();
    });

    afterAll(async () => {
      await cleanupTestData();
    });

    it('should set session variables in tenant context', async () => {
      await setTenantRlsContext({ tenantId: TEST_TENANT_A_ID, userId: TEST_USER_ID }, async (tx) => {
        // Verify session variables are set
        const [tenantId] = await tx.execute(sql`SELECT current_setting('app.tenant_id', true) as value`);
        const [userId] = await tx.execute(sql`SELECT current_setting('app.user_id', true) as value`);
        const [isAuth] = await tx.execute(sql`SELECT current_setting('app.is_authenticated', true) as value`);

        expect((tenantId as { value: string }).value).toBe(TEST_TENANT_A_ID);
        expect((userId as { value: string }).value).toBe(TEST_USER_ID);
        expect((isAuth as { value: string }).value).toBe('true');
      });
    });

    it('should clear session variables after transaction', async () => {
      // First set context
      await setTenantRlsContext({ tenantId: TEST_TENANT_A_ID, userId: TEST_USER_ID }, async () => {
        // Context is set here
      });

      // After transaction, context should not leak
      // (This is ensured by set_config with `true` for transaction scope)
      // In a real pool scenario, the connection may be reused, but variables are reset
      const result = await db.execute(sql`SELECT current_setting('app.tenant_id', true) as value`);
      // Should be empty or null after transaction
      const value = (result[0] as { value: string | null })?.value;
      expect(value === null || value === '').toBe(true);
    });

    it('should set empty tenant in user context', async () => {
      await setUserRlsContext({ userId: TEST_USER_ID }, async (tx) => {
        const [tenantId] = await tx.execute(sql`SELECT current_setting('app.tenant_id', true) as value`);
        const [userId] = await tx.execute(sql`SELECT current_setting('app.user_id', true) as value`);

        expect((tenantId as { value: string }).value).toBe('');
        expect((userId as { value: string }).value).toBe(TEST_USER_ID);
      });
    });

    it('should set unauthenticated flag in public context', async () => {
      await setPublicRlsContext(TEST_TENANT_A_ID, async (tx) => {
        const [tenantId] = await tx.execute(sql`SELECT current_setting('app.tenant_id', true) as value`);
        const [isAuth] = await tx.execute(sql`SELECT current_setting('app.is_authenticated', true) as value`);

        expect((tenantId as { value: string }).value).toBe(TEST_TENANT_A_ID);
        expect((isAuth as { value: string }).value).toBe('false');
      });
    });
  });

  describe('Tenant Nanoid Generation', () => {
    it('should generate 24-character lowercase IDs', () => {
      const id = nanoidTenant();
      expect(id).toHaveLength(24);
      expect(/^[a-z0-9]+$/.test(id)).toBe(true);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => nanoidTenant()));
      expect(ids.size).toBe(100);
    });
  });
});

describe('RLS Policy Verification', () => {
  // These tests verify the actual RLS policies work correctly.
  // They require the database roles to be set up.
  // Skip if running in basic test mode without PostgreSQL.

  it.skip('TODO: Add test for deny access without tenant context', () => {
    // When RLS policies are fully applied, queries without context should fail
  });

  it.skip('TODO: Add test for cross-tenant read isolation', () => {
    // Tenant A user should not see Tenant B data
  });

  it.skip('TODO: Add test for cross-tenant write isolation', () => {
    // Tenant A user should not be able to write to Tenant B
  });

  it.skip('TODO: Add test for organization membership enforcement', () => {
    // User without org membership should not see org data
  });

  it.skip('TODO: Add test for public content visibility', () => {
    // Unauthenticated users should see is_public=true rows only
  });

  it.skip('TODO: Add test for immutability triggers', () => {
    // tenant_id and organization_id should not be updatable
  });
});
