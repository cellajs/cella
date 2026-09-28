import { eq } from 'drizzle-orm';
import { membershipInvite } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { addProvenEmail } from '#/modules/auth/general/helpers/mark-email-verified';
import { tokensTable } from '#/modules/auth/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { hashToken } from '#/utils/hash-token';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import {
  createOrganizationAdminUser,
  createSystemAdminUser,
  createTestOrganization,
  createTestSession,
  createTestUser,
  mailedLink,
} from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';

setTestConfig({
  enabledAuthStrategies: ['passkey'],
  selfRegistration: true,
});

afterEach(async () => await clearDatabase());

describe('Membership Invitation', async () => {
  const call = await createAppClient();

  const createOrgAndAdmin = async () => {
    const organization = await createTestOrganization();
    const user = await createOrganizationAdminUser(
      'admin@example.com',
      organization.id,
      adminRole,
      organization.tenantId,
    );

    const sessionCookie = await createTestSession(user);

    return { organization, sessionCookie };
  };

  const makeInviteRequest = async (
    tenantId: string,
    organizationId: string,
    inviteData: any,
    sessionCookie: string | null,
  ) => {
    return await call(membershipInvite, {
      path: { tenantId, organizationId },
      body: inviteData,
      query: { entityId: organizationId, entityType: 'organization' as const },
      headers: {
        ...defaultHeaders,
        Cookie: sessionCookie || '',
      },
    });
  };

  const getInactiveMemberships = async (organizationId: string) => {
    return await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.organizationId, organizationId));
  };

  it('should invite new users to organization', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();

    const { response: res, data } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      { emails: ['user1@example.com', 'user2@example.com'], role: memberRole },
      sessionCookie,
    );

    expect(res.status).toBe(200);
    const response = data as { data: any[]; rejectedIds: string[]; invitesSentCount: number };
    expect(response.invitesSentCount).toBe(2);
    expect(response.rejectedIds).toHaveLength(0);

    const inactiveMemberships = await getInactiveMemberships(organization.id);
    expect(inactiveMemberships).toHaveLength(2);
    expect(inactiveMemberships[0].email).toBe('user1@example.com');
    expect(inactiveMemberships[1].email).toBe('user2@example.com');
    expect(inactiveMemberships[0].role).toBe(memberRole);
    expect(inactiveMemberships[1].role).toBe(memberRole);

    // The last mail carries the link of its own address's token.
    const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, inactiveMemberships[1].tokenId!));
    expect(token.secret).toBe(hashToken(mailedLink('inviteLink').token));
  });

  it('should invite existing users to organization', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();
    const existingUser = await createTestUser('existing@example.com');

    const { response: res, data } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      { emails: ['existing@example.com'], role: adminRole },
      sessionCookie,
    );

    expect(res.status).toBe(200);
    const response = data as { data: any[]; rejectedIds: string[]; invitesSentCount: number };
    expect(response.invitesSentCount).toBe(1);
    expect(response.rejectedIds).toHaveLength(0);

    const inactiveMemberships = await getInactiveMemberships(organization.id);
    expect(inactiveMemberships).toHaveLength(1);
    expect(inactiveMemberships[0].userId).toBe(existingUser.id);
    expect(inactiveMemberships[0].role).toBe(adminRole);
  });

  it('binds an invitation sent to a proven secondary address of an existing user', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();
    const existingUser = await createTestUser('primary@example.com');
    await addProvenEmail(db, { userId: existingUser.id, email: 'work@example.com', via: 'github' });

    const { response: res, data } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      { emails: ['work@example.com'], role: memberRole },
      sessionCookie,
    );

    expect(res.status).toBe(200);
    expect((data as { invitesSentCount: number }).invitesSentCount).toBe(1);

    const [invitation] = await getInactiveMemberships(organization.id);
    expect(invitation.userId).toBe(existingUser.id);
    // Known address, so no token: the invitation is answered in-app.
    expect(invitation.tokenId).toBeNull();
  });

  it('should handle mixed existing and new users', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();
    const existingUser = await createTestUser('existing@example.com');

    const { response: res, data } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      { emails: ['existing@example.com', 'newuser@example.com'], role: memberRole },
      sessionCookie,
    );

    expect(res.status).toBe(200);
    const response = data as { data: any[]; rejectedIds: string[]; invitesSentCount: number };
    expect(response.invitesSentCount).toBe(2);
    expect(response.rejectedIds).toHaveLength(0);

    const inactiveMemberships = await getInactiveMemberships(organization.id);
    expect(inactiveMemberships).toHaveLength(2);

    const existingUserMembership = inactiveMemberships.find((im) => im.userId === existingUser.id);
    const newUserMembership = inactiveMemberships.find((im) => im.userId === null);

    expect(existingUserMembership).toBeDefined();
    expect(newUserMembership).toBeDefined();
    expect(existingUserMembership?.email).toBe('existing@example.com');
    expect(newUserMembership?.email).toBe('newuser@example.com');
  });

  it('should handle already invited users', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();

    const inviteData = { emails: ['user@example.com'], role: memberRole };

    const { response: firstRes } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      inviteData,
      sessionCookie,
    );
    expect(firstRes.status).toBe(200);

    const { response: secondRes, data } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      inviteData,
      sessionCookie,
    );
    expect(secondRes.status).toBe(200);

    const response = data as { data: any[]; rejectedIds: string[]; invitesSentCount: number };
    expect(response.invitesSentCount).toBe(0);
  });

  it('returns the membership a system admin joins by inviting themself, archive, mute and order included', async () => {
    const organization = await createTestOrganization();
    const sysAdmin = await createSystemAdminUser('sysadmin@example.com');

    const { response: res, data } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      { emails: [sysAdmin.email], role: memberRole },
      await createTestSession(sysAdmin),
    );

    expect(res.status).toBe(200);
    // Their own membership: the client files it with their other memberships, menu order included.
    const [joined] = (data as { data: Record<string, unknown>[] }).data;
    expect(joined).toMatchObject({ userId: sysAdmin.id, role: memberRole, archived: false, muted: false });
    expect(joined.displayOrder).toEqual(expect.any(Number));
  });
});
