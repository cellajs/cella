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

/** Each call produces a unique tenant, for side-by-side cross-tenant tests. */
export async function createTestTenant(_call: Call, label: string): Promise<TestTenant> {
  const email = `${label}-user@security-test.com`;

  // Seeded via the DB as superuser, which bypasses RLS.
  const organization = await createTestOrganization();

  const user = await createOrganizationAdminUser(email, organization.id, 'admin', true, organization.tenantId);

  const sessionCookie = await createTestSession(user);

  return {
    tenantId: organization.tenantId,
    organization: { id: organization.id, slug: organization.slug },
    user: { id: user.id, email },
    sessionCookie,
  };
}

/** One organization per tenant, so a cross-org test needs a fresh tenant with its own org. */
export async function createSecondOrg() {
  return createTestOrganization();
}

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

/** Truncates tenant-scoped and auth tables. */
export async function clearSecurityTestData() {
  await db.execute(sql`TRUNCATE TABLE
    sessions, tokens, passkeys, oauth_accounts, emails,
    memberships, inactive_memberships, organizations, tenants, users
    CASCADE`);
}
