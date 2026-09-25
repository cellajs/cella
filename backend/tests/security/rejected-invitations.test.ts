import { and, eq } from 'drizzle-orm';
import { acceptInvitationToken, handleMembershipInvitation, membershipInvite } from 'sdk';
import { hierarchy } from 'shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { defaultRestrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { getIsoDate } from '#/utils/iso-date';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization, createTestSession, createTestUser, type ErrorResponse } from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

vi.mock('#/lib/mailer', () => ({
  mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) },
}));

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const memberRole = hierarchy.getLeastPrivilegedRole('organization');
const [adminRole] = hierarchy.getRoles('organization');

type PendingList = { items: { id: string; email: string }[]; total: number };

/** A declined invitation is answered: nobody can accept it later, and it neither lists nor counts as pending. */
describe('Rejected invitations', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');

  beforeAll(() => {
    mockFetchRequest();
  });

  afterEach(async () => await clearSecurityTestData());

  const respond = (id: string, acceptOrReject: 'accept' | 'reject', sessionCookie: string) =>
    call(handleMembershipInvitation, {
      path: { id, acceptOrReject },
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });

  const membershipsIn = (userId: string, organizationId: string) =>
    db
      .select({ id: membershipsTable.id })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.organizationId, organizationId)));

  const rejectedAtOf = async (id: string) =>
    (
      await db
        .select({ rejectedAt: inactiveMembershipsTable.rejectedAt })
        .from(inactiveMembershipsTable)
        .where(eq(inactiveMembershipsTable.id, id))
    )[0]?.rejectedAt;

  const markRejected = (id: string) =>
    db.update(inactiveMembershipsTable).set({ rejectedAt: getIsoDate() }).where(eq(inactiveMembershipsTable.id, id));

  it('must not accept a rejected invitation via handleMembershipInvitation', async () => {
    const organization = await createTestOrganization();
    const invitee = await createTestUser('rejected-invitee@security-test.com');
    const sessionCookie = await createTestSession(invitee);
    const { inactiveMembership } = await createInvitation({
      organization,
      email: invitee.email,
      createdBy: invitee.id,
      boundTo: invitee.id,
    });

    expect((await respond(inactiveMembership.id, 'reject', sessionCookie)).response.status).toBe(200);

    const { response, error } = await respond(inactiveMembership.id, 'accept', sessionCookie);
    expect(response.status).toBe(404);
    expect((error as ErrorResponse).type).toBe('inactive_membership_not_found');
    expect(await membershipsIn(invitee.id, organization.id)).toEqual([]);
    expect(await rejectedAtOf(inactiveMembership.id)).not.toBeNull();
  });

  it('must not accept a rejected invitation via a surviving invitation token', async () => {
    const organization = await createTestOrganization();
    const invitee = await createTestUser('rejected-token-invitee@security-test.com');
    const sessionCookie = await createTestSession(invitee);
    // Rejecting retires the invitation's tokens; a token row that outlived it must still lead nowhere.
    const { inactiveMembership, invitationCookie } = await createInvitation({
      organization,
      email: invitee.email,
      createdBy: invitee.id,
      token: 'invoked',
    });
    await markRejected(inactiveMembership.id);

    const { response, error } = await call(acceptInvitationToken, {
      headers: { ...defaultHeaders, Cookie: [sessionCookie, invitationCookie].join('; ') },
    });
    expect(response.status).toBe(404);
    expect((error as ErrorResponse).type).toBe('inactive_membership_not_found');
    expect(await membershipsIn(invitee.id, organization.id)).toEqual([]);
  });

  it('accepts a pending invitation by id and by token (positive control)', async () => {
    const organization = await createTestOrganization();
    const byId = await createTestUser('pending-by-id@security-test.com');
    const byIdInvitation = await createInvitation({
      organization,
      email: byId.email,
      createdBy: byId.id,
      boundTo: byId.id,
    });
    const accepted = await respond(byIdInvitation.inactiveMembership.id, 'accept', await createTestSession(byId));
    expect(accepted.response.status).toBe(200);
    expect(await membershipsIn(byId.id, organization.id)).toHaveLength(1);

    const byToken = await createTestUser('pending-by-token@security-test.com');
    const { invitationCookie } = await createInvitation({
      organization,
      email: byToken.email,
      createdBy: byToken.id,
      token: 'invoked',
    });
    const viaToken = await call(acceptInvitationToken, {
      headers: { ...defaultHeaders, Cookie: [await createTestSession(byToken), invitationCookie].join('; ') },
    });
    expect(viaToken.response.status).toBe(200);
    expect(await membershipsIn(byToken.id, organization.id)).toHaveLength(1);
  });

  it('must not list or count a rejected invitation as pending', async () => {
    const organization = await createTestOrganization();
    // A member quota of three: the admin, the pending invitation and one more invitation fill it.
    const restrictions = defaultRestrictions();
    await db
      .update(tenantsTable)
      .set({ restrictions: { ...restrictions, quotas: { ...restrictions.quotas, user: 3 } } })
      .where(eq(tenantsTable.id, organization.tenantId));
    const admin = await createOrgUser(call, organization.tenantId, organization.id, 'rejected-admin', adminRole);
    const rejected = await createInvitation({
      organization,
      email: 'rejected-address@security-test.com',
      createdBy: admin.id,
    });
    await markRejected(rejected.inactiveMembership.id);
    await createInvitation({ organization, email: 'pending-address@security-test.com', createdBy: admin.id });

    const query = new URLSearchParams({ entityId: organization.id, entityType: 'organization' });
    const listed = await baseApp.request(`/${organization.tenantId}/${organization.id}/memberships/pending?${query}`, {
      headers: { ...defaultHeaders, Cookie: admin.sessionCookie },
    });
    expect(listed.status).toBe(200);
    const { items, total } = (await listed.json()) as PendingList;
    expect(items.map((item) => item.email)).toEqual(['pending-address@security-test.com']);
    expect(total).toBe(1);

    const invited = await call(membershipInvite, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      query: { entityId: organization.id, entityType: 'organization' },
      body: { emails: ['one-more@security-test.com'], role: memberRole },
      headers: { ...defaultHeaders, Cookie: admin.sessionCookie },
    });
    expect(invited.response.status).toBe(200);
    expect((invited.data as { invitesSentCount: number }).invitesSentCount).toBe(1);

    const overQuota = await call(membershipInvite, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      query: { entityId: organization.id, entityType: 'organization' },
      body: { emails: ['past-the-quota@security-test.com'], role: memberRole },
      headers: { ...defaultHeaders, Cookie: admin.sessionCookie },
    });
    expect(overQuota.response.status).toBe(403);
    expect((overQuota.error as ErrorResponse).type).toBe('restrict_by_org');
  });
});
