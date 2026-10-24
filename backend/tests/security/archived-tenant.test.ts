import { deleteOrganizations, getAttachments, getMyMemberships, getOrganization, getOrganizations, updateTenant } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultHeaders } from '../fixtures';
import { createSystemAdminUser, createTestSession } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

afterEach(async () => await clearSecurityTestData());

/**
 * Deleting an organization archives its tenant: from that moment the organization belongs to no one. A member reads
 * nothing of it and finds it in no list, until a system admin restores the tenant.
 */
describe('Archived organizations', async () => {
  const call = await createAppClient();

  it('must not show or serve a deleted organization to its members, until a system admin restores it', async () => {
    const tenant = await createTestTenant(call, 'archived-org');
    const member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'archived-member');
    const headers = { ...defaultHeaders, Cookie: member.sessionCookie };
    const organizationIds = async () => {
      const memberships = (await call(getMyMemberships, { headers })).data as { items: { organizationId: string }[] };
      const organizations = (await call(getOrganizations, { headers })).data as { items: { id: string }[] };
      return [...memberships.items.map((m) => m.organizationId), ...organizations.items.map((o) => o.id)];
    };
    expect(await organizationIds()).toContain(tenant.organization.id);

    const deleted = await call(deleteOrganizations, {
      path: { tenantId: tenant.tenantId },
      body: { ids: [tenant.organization.id] },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(deleted.response.status).toBe(200);

    expect(await organizationIds()).not.toContain(tenant.organization.id);
    const read = await call(getOrganization, { path: { tenantId: tenant.tenantId, id: tenant.organization.id }, headers });
    const attachments = await call(getAttachments, { path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id }, headers });
    expect(read.response.status).toBe(403);
    expect(attachments.response.status).toBe(403);

    const admin = await createSystemAdminUser(`archived-sysadmin-${nanoid(6)}@security-test.com`);
    const restored = await call(updateTenant, {
      path: { tenantId: tenant.tenantId },
      body: { status: 'active' },
      headers: { ...defaultHeaders, Cookie: await createTestSession(admin) },
    });
    expect(restored.response.status).toBe(200);
    expect(await organizationIds()).toContain(tenant.organization.id);
  });
});
