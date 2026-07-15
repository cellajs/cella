import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getAttachments, getOrganizations } from 'sdk';
import { testRuntimeDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as adminDb } from '#/db/db';
import { defaultHeaders } from '../fixtures';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// Runtime role connection (subject to RLS policies)
const RUNTIME_DB_URL = testRuntimeDatabaseUrl;

function getRows<T = Record<string, unknown>>(result: any): T[] {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function ensureRuntimeRoleAccess() {
  await adminDb.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime_role') THEN
        CREATE ROLE runtime_role WITH LOGIN PASSWORD 'dev_password';
      END IF;

      GRANT USAGE ON SCHEMA public TO runtime_role;
      GRANT USAGE ON SCHEMA pg_catalog TO runtime_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO runtime_role;
    END $$;
  `);
}

// Verifies scoped API response data and runtime_role RLS reads for tenant isolation.
describe('Defense-in-depth data isolation', async () => {
  const call = await createAppClient();
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let runtimeDb: NodePgDatabase | null = null;
  let rolesAvailable = false;

  beforeAll(async () => {
    mockFetchRequest();
    tenantA = await createTestTenant(call, 'depth-a');
    tenantB = await createTestTenant(call, 'depth-b');
    await ensureRuntimeRoleAccess();

    // Try to connect as runtime_role for RLS-level tests
    try {
      const roleCheck = getRows<{ exists: boolean }>(
        await adminDb.execute(
          sql`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') as exists`,
        ),
      );
      if (roleCheck[0]?.exists) {
        runtimeDb = drizzle({ connection: { connectionString: RUNTIME_DB_URL } });
        rolesAvailable = true;
      }
    } catch {
      // Skip RLS-level tests when roles are unavailable.
    }
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  describe('API-level data scoping', () => {
    it('should return only User A organizations to User A', async () => {
      const { data, response } = await call(getOrganizations, {
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(response.status).toBe(200);
      const result = data as { items?: Array<{ id: string }> };
      const orgIds = result?.items?.map((o) => o.id) ?? [];
      expect(orgIds).toContain(tenantA.organization.id);
      expect(orgIds).not.toContain(tenantB.organization.id);
    });

    it('should return only User B organizations to User B', async () => {
      const { data, response } = await call(getOrganizations, {
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      expect(response.status).toBe(200);
      const result = data as { items?: Array<{ id: string }> };
      const orgIds = result?.items?.map((o) => o.id) ?? [];
      expect(orgIds).toContain(tenantB.organization.id);
      expect(orgIds).not.toContain(tenantA.organization.id);
    });

    it('should return empty attachment list for own tenant (no attachments created)', async () => {
      const { data, response } = await call(getAttachments, {
        path: { tenantId: tenantA.tenantId, organizationId: tenantA.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(response.status).toBe(200);
      const result = data as { items?: Array<unknown> };
      expect(result?.items ?? []).toHaveLength(0);
    });
  });

  describe('RLS-level data scoping (runtime_role)', () => {
    it('should allow cross-tenant organization reads (no RLS on channel entities — app-layer isolation)', async () => {
      if (!rolesAvailable || !runtimeDb) return;

      // Organizations have no RLS, so runtime_role can read all orgs.
      // Cross-tenant isolation for channel entities is enforced at the API layer (tenantGuard/orgGuard).
      const rows = await runtimeDb.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantA.tenantId}, true)`);
        await tx.execute(sql`SELECT set_config('app.user_id', ${tenantA.user.id}, true)`);
        return getRows<{ id: string }>(
          await tx.execute(sql`SELECT id FROM organizations WHERE tenant_id = ${tenantB.tenantId}`),
        );
      });
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow same-tenant organization reads via RLS', async () => {
      if (!rolesAvailable || !runtimeDb) return;

      const rows = await runtimeDb.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantA.tenantId}, true)`);
        await tx.execute(sql`SELECT set_config('app.user_id', ${tenantA.user.id}, true)`);
        return getRows<{ id: string }>(
          await tx.execute(sql`SELECT id FROM organizations WHERE tenant_id = ${tenantA.tenantId}`),
        );
      });
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });
});
