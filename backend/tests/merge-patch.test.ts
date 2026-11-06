import { eq } from 'drizzle-orm';
import { nanoid } from 'shared/utils/nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizationsTable } from '#/modules/organization/organization-db';
import { defaultRestrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { defaultHeaders } from './fixtures';
import { adminDb, createSystemAdminUser, createTestSession } from './helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * An update documented as `application/merge-patch+json` merges as RFC 7396 says, so a client that sends one member of
 * an object leaves its siblings as stored: an object merges key by key, `null` removes a key (which then reads its
 * default), and an array replaces what it lands on. A `null` for a field the resource cannot lack is refused.
 */
describe('Merge patch updates', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  let tenant: TestTenant;

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'merge-patch');
  });

  afterAll(async () => await clearSecurityTestData());

  /** A raw request, as a client sends a patch: the SDK types refuse a `null` the server must refuse too. */
  const patchAt = async (path: string, cookie: string, body: object) => {
    const headers = { ...defaultHeaders, 'Content-Type': 'application/merge-patch+json', Cookie: cookie };
    return (await baseApp.request(path, { method: 'PATCH', headers, body: JSON.stringify(body) })).status;
  };

  it("merges an organization's tool arrangement slot by slot and key by key", async () => {
    const patch = (toolsConfig: object | null) =>
      patchAt(`/tenants/${tenant.tenantId}/organizations/${tenant.organization.id}`, tenant.sessionCookie, { toolsConfig });
    const stored = async () => {
      const [row] = await adminDb
        .select({ toolsConfig: organizationsTable.toolsConfig })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, tenant.organization.id));
      return row.toolsConfig;
    };

    expect(await patch({ 'organization.tabs': { order: ['a', 'b'], hidden: ['b'] }, 'organization.settings': { order: ['c'] } })).toBe(200);
    expect(await patch({ 'organization.tabs': { order: ['b', 'a'] } })).toBe(200);
    expect(await stored()).toEqual({ 'organization.tabs': { order: ['b', 'a'], hidden: ['b'] }, 'organization.settings': { order: ['c'] } });

    expect(await patch({ 'organization.tabs': { hidden: null }, 'organization.settings': null })).toBe(200);
    expect(await stored()).toEqual({ 'organization.tabs': { order: ['b', 'a'] } });

    expect(await patch(null)).toBe(400);
    expect(await stored()).toEqual({ 'organization.tabs': { order: ['b', 'a'] } });
  });

  it("merges a tenant's restrictions member by member, and null gives a member its default again", async () => {
    const admin = await createSystemAdminUser(`merge-patch-${nanoid(8)}@security-test.com`);
    const cookie = await createTestSession(admin);
    const defaults = defaultRestrictions();
    const patch = (restrictions: object) => patchAt(`/tenants/${tenant.tenantId}`, cookie, { restrictions });
    const stored = async () => {
      const [row] = await adminDb.select({ restrictions: tenantsTable.restrictions }).from(tenantsTable).where(eq(tenantsTable.id, tenant.tenantId));
      return row.restrictions;
    };

    expect(await patch({ quotas: { organization: 7 }, rateLimits: { invitationMailsPerDay: 3 } })).toBe(200);
    expect(await patch({ quotas: { user: 9 } })).toBe(200);
    expect(await stored()).toEqual({
      ...defaults,
      quotas: { ...defaults.quotas, organization: 7, user: 9 },
      rateLimits: { ...defaults.rateLimits, invitationMailsPerDay: 3 },
    });

    expect(await patch({ quotas: { organization: null } })).toBe(200);
    const { organization: _removed, ...quotas } = { ...defaults.quotas, user: 9 };
    expect(await stored()).toEqual({ ...defaults, quotas, rateLimits: { ...defaults.rateLimits, invitationMailsPerDay: 3 } });
  });
});
