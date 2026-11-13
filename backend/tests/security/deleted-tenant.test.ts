import { eq } from 'drizzle-orm';
import { batchDeleteOrganizations, getOrganization, listAttachments, listMyMemberships, listOrganizations, updateTenant } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb } from '#/db/db';
import { streamSubscriberManager, userTopic } from '#/modules/entities/stream/subscriber-manager';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { defaultHeaders } from '../fixtures';
import { createSystemAdminUser, createTestSession } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant } from './helpers';
import { cancelOpenStreams, expectClosedWith, expectStillOpen, insertSession, openStream } from './session-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

afterEach(async () => {
  await cancelOpenStreams();
  await clearSecurityTestData();
});

/**
 * Deleting an organization marks its tenant deleted: from that moment the organization belongs to no one. A member reads
 * nothing of it and finds it in no list, until a system admin restores the tenant.
 */
describe('Deleted organizations', async () => {
  const call = await createAppClient();

  it('must not show or serve a deleted organization to its members, until a system admin restores it', async () => {
    const tenant = await createTestTenant(call, 'deleted-org');
    const member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'deleted-member');
    const headers = { ...defaultHeaders, Cookie: member.sessionCookie };
    const organizationIds = async () => {
      const memberships = (await call(listMyMemberships, { headers })).data as { results: { organizationId: string }[] };
      const organizations = (await call(listOrganizations, { headers })).data as { results: { id: string }[] };
      return [...memberships.results.map((m) => m.organizationId), ...organizations.results.map((o) => o.id)];
    };
    expect(await organizationIds()).toContain(tenant.organization.id);

    const deleted = await call(batchDeleteOrganizations, {
      path: { tenantId: tenant.tenantId },
      body: { ids: [tenant.organization.id] },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(deleted.response.status).toBe(200);

    expect(await organizationIds()).not.toContain(tenant.organization.id);
    const read = await call(getOrganization, { path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id }, headers });
    const attachments = await call(listAttachments, { path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id }, headers });
    expect(read.response.status).toBe(403);
    expect(attachments.response.status).toBe(403);

    const admin = await createSystemAdminUser(`deleted-sysadmin-${nanoid(6)}@security-test.com`);
    const restored = await call(updateTenant, {
      path: { tenantId: tenant.tenantId },
      body: { status: 'active' },
      headers: { ...defaultHeaders, Cookie: await createTestSession(admin) },
    });
    expect(restored.response.status).toBe(200);
    expect(await organizationIds()).toContain(tenant.organization.id);
  });

  it("must not keep a deleted tenant's stream open", async () => {
    const [tenant, other] = [await createTestTenant(call, 'deleted-stream'), await createTestTenant(call, 'deleted-stream-other')];
    const member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'deleted-stream-member');
    const session = await insertSession(member);
    const memberStream = await openStream(member.id, session);
    const otherStream = await openStream(other.user.id, await insertSession(other.user));

    const deleted = await call(batchDeleteOrganizations, {
      path: { tenantId: tenant.tenantId },
      body: { ids: [tenant.organization.id] },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(deleted.response.status).toBe(200);

    // The close is how an open app learns the organization went away; its reconnect registers without it.
    await expectClosedWith(memberStream, 'access_changed');
    await openStream(member.id, session);
    const [reconnected] = streamSubscriberManager.getByTopic(userTopic(member.id));
    expect([...reconnected.organizationIds]).toEqual([]);
    expectStillOpen(other.user.id, otherStream);
  });

  it('marks the tenant deleted also when the URL spells its id in capitals', async () => {
    const tenant = await createTestTenant(call, 'deleted-capitals');

    const deleted = await call(batchDeleteOrganizations, {
      path: { tenantId: tenant.tenantId.toUpperCase() },
      body: { ids: [tenant.organization.id] },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(deleted.response.status).toBe(200);

    const [stored] = await baseDb.select({ status: tenantsTable.status }).from(tenantsTable).where(eq(tenantsTable.id, tenant.tenantId));
    expect(stored.status).toBe('deleted');
  });
});
