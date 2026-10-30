import { eq } from 'drizzle-orm';
import { deleteOrganizations, getAttachments, getMyMemberships, getOrganization, getOrganizations, updateTenant } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb } from '#/db/db';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
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

  it("must not keep an archived tenant's stream open", async () => {
    const [tenant, other] = [await createTestTenant(call, 'archived-stream'), await createTestTenant(call, 'archived-stream-other')];
    const member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'archived-stream-member');
    const session = await insertSession(member);
    const memberStream = await openStream(member.id, session);
    const otherStream = await openStream(other.user.id, await insertSession(other.user));

    const deleted = await call(deleteOrganizations, {
      path: { tenantId: tenant.tenantId },
      body: { ids: [tenant.organization.id] },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(deleted.response.status).toBe(200);

    // The close is how an open app learns the organization went away; its reconnect registers without it.
    await expectClosedWith(memberStream, 'access_changed');
    await openStream(member.id, session);
    const [reconnected] = streamSubscriberManager.getByTopic<AppStreamSubscriber>(userTopic(member.id));
    expect([...reconnected.organizationIds]).toEqual([]);
    expectStillOpen(other.user.id, otherStream);
  });

  it('archives the tenant also when the URL spells its id in capitals', async () => {
    const tenant = await createTestTenant(call, 'archived-capitals');

    const deleted = await call(deleteOrganizations, {
      path: { tenantId: tenant.tenantId.toUpperCase() },
      body: { ids: [tenant.organization.id] },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(deleted.response.status).toBe(200);

    const [stored] = await baseDb.select({ status: tenantsTable.status }).from(tenantsTable).where(eq(tenantsTable.id, tenant.tenantId));
    expect(stored.status).toBe('archived');
  });
});
