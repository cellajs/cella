/**
 * Security test helpers for multi-tenant isolation testing.
 *
 * Provides scaffolding to create fully isolated tenants with
 * organizations, users, memberships, and active sessions.
 */

import { sql } from 'drizzle-orm';
import { baseDb as db } from '#/db/db';
import { organizationsTable } from '#/db/schema/organizations';
import { mockOrganization } from '../../mocks/mock-organization';
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
 * Each call produces a unique tenant — safe for side-by-side cross-tenant tests.
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
 * Creates a second organization in an existing tenant.
 * Returns the new organization (id, slug, tenantId).
 */
export async function createSecondOrg(tenantId: string) {
  const orgData = mockOrganization();
  const [organization] = await db
    .insert(organizationsTable)
    .values({ ...orgData, tenantId })
    .returning();
  return organization;
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
  role: 'admin' | 'member' = 'member',
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
