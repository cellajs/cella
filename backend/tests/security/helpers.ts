import { sql } from 'drizzle-orm';
import type { EntityRole } from 'shared';
import { baseDb as db } from '#/db/db';
import { createOrganizationAdminUser, createTestOrganization, createTestSession } from '../helpers';
import type { createAppClient } from '../test-client';

export interface TestTenant {
  tenantId: string;
  organization: { id: string; slug: string };
  user: { id: string; email: string };
  sessionCookie: string;
}

type Call = Awaited<ReturnType<typeof createAppClient>>;

/**
 * Creates a fully isolated tenant with organization, user, membership, and active session.
 * Each call produces a unique tenant for side-by-side cross-tenant tests.
 */
export async function createTestTenant(_call: Call, label: string): Promise<TestTenant> {
  const email = `${label}-user@security-test.com`;

  // Create tenant + organization via DB (superuser, bypasses RLS)
  const organization = await createTestOrganization();

  // Create user with membership in that organization
  const user = await createOrganizationAdminUser(email, organization.id, 'admin', true, organization.tenantId);

  // Create session directly in DB
  const sessionCookie = await createTestSession(user);

  return {
    tenantId: organization.tenantId,
    organization: { id: organization.id, slug: organization.slug },
    user: { id: user.id, email },
    sessionCookie,
  };
}

/**
 * Creates a second, independent organization for cross-org tests. Under the 1 tenant = 1 organization
 * invariant each org lives in its own tenant, so this provisions a fresh tenant + org; the
 * returned organization carries its own `tenantId` (distinct from any existing tenant).
 */
export async function createSecondOrg() {
  return createTestOrganization();
}

/**
 * Creates a user with membership in a specific organization and signs them in.
 * Returns user info and session cookie.
 */
export async function createOrgUser(
  _call: Call,
  tenantId: string,
  organizationId: string,
  label: string,
  role: EntityRole = 'member',
) {
  const email = `${label}-user@security-test.com`;

  const user = await createOrganizationAdminUser(email, organizationId, role, true, tenantId);

  const sessionCookie = await createTestSession(user);

  return { id: user.id, email, sessionCookie };
}

/**
 * Cleanup all security test data. Truncates tenant-scoped tables + auth tables.
 */
export async function clearSecurityTestData() {
  await db.execute(sql`TRUNCATE TABLE
    sessions, tokens, passkeys, oauth_accounts, emails,
    memberships, inactive_memberships, organizations, tenants, users
    CASCADE`);
}
