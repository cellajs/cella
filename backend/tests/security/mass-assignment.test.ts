import { eq } from 'drizzle-orm';
import { updateMe, updateOrganization } from 'sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { usersTable } from '#/modules/user/user-db';
import { adminRole, defaultHeaders } from '../fixtures';
import { createTestOrganization } from '../helpers';
import { createAppClient, type TestResult } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

interface Row {
  route: string;
  /** The update, naming columns the caller may not set beside one they may. */
  send: () => Promise<TestResult>;
  /** The row after the update. */
  row: () => Promise<Record<string, unknown>>;
  /** The permitted field, as sent: proof that the update ran. */
  changed: Record<string, unknown>;
  /** The columns the caller may not set, with the values they must keep. */
  kept: () => Record<string, unknown>;
}

/**
 * The update schemas pick the fields a caller may send, zod drops the rest, and the operations spread the body into
 * the row: the pick is the whole barrier. One gaining `email` or `mfaRequired` would let a profile update take over an
 * address or switch MFA without its factor proof; one gaining `tenantId` would move an organization to another tenant.
 */
describe('Columns outside the body pick', async () => {
  const call = await createAppClient();
  let admin: { id: string; email: string; sessionCookie: string };
  let organization: { id: string; tenantId: string; createdBy: string | null };
  /** A tenant the admin created: an id the foreign key would take. */
  let otherTenantId: string;

  const headers = () => ({ ...defaultHeaders, Cookie: admin.sessionCookie });

  beforeAll(async () => {
    organization = await createTestOrganization();
    admin = await createOrgUser(call, organization.tenantId, organization.id, 'mass-assignment-admin', adminRole);
    const [other] = await db.insert(tenantsTable).values({ name: 'Other Tenant', createdBy: admin.id }).returning();
    otherTenantId = other.id;
  });

  afterAll(async () => await clearSecurityTestData());

  const rows: Row[] = [
    {
      route: 'updateMe',
      send: () =>
        call(updateMe, { body: { firstName: 'Renamed', email: 'taken-over@security-test.com', mfaRequired: true } as never, headers: headers() }),
      row: async () => (await db.select().from(usersTable).where(eq(usersTable.id, admin.id)))[0],
      changed: { firstName: 'Renamed' },
      kept: () => ({ email: admin.email, mfaRequired: false }),
    },
    {
      route: 'updateOrganization',
      send: () =>
        call(updateOrganization, {
          path: { tenantId: organization.tenantId, id: organization.id },
          body: { name: 'Renamed', tenantId: otherTenantId, createdBy: admin.id } as never,
          headers: headers(),
        }),
      row: async () => (await db.select().from(organizationsTable).where(eq(organizationsTable.id, organization.id)))[0],
      changed: { name: 'Renamed' },
      kept: () => ({ tenantId: organization.tenantId, createdBy: organization.createdBy }),
    },
  ];

  it.each(rows)('must not set a column outside the pick via $route', async ({ send, row, changed, kept }) => {
    const { response } = await send();
    expect(response.status).toBe(200);
    expect(await row()).toMatchObject({ ...changed, ...kept() });
  });
});
