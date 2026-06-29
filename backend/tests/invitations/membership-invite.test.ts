import { eq } from 'drizzle-orm';
import { membershipInvite } from 'sdk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { defaultHeaders } from '../fixtures';
import { createOrganizationAdminUser, createTestOrganization, createTestSession, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('#/modules/memberships/handlers', async () => {
  const actual = await vi.importActual('#/modules/memberships/handlers');
  return {
    ...actual,
    MemberInviteEmail: vi.fn().mockResolvedValue(undefined),
    MemberInviteWithTokenEmail: vi.fn().mockResolvedValue(undefined),
  };
});

setTestConfig({
  enabledAuthStrategies: ['passkey'],
  selfRegistration: true,
});

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => await clearDatabase());

describe('Membership Invitation', async () => {
  const call = await createAppClient();

  const createOrgAndAdmin = async () => {
    const organization = await createTestOrganization();
    const user = await createOrganizationAdminUser(
      'admin@example.com',
      organization.id,
      'admin',
      true,
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
      { emails: ['user1@example.com', 'user2@example.com'], role: 'member' },
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
    expect(inactiveMemberships[0].role).toBe('member');
    expect(inactiveMemberships[1].role).toBe('member');
  });

  it('should invite existing users to organization', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();
    const existingUser = await createTestUser('existing@example.com');

    const { response: res, data } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      { emails: ['existing@example.com'], role: 'admin' },
      sessionCookie,
    );

    expect(res.status).toBe(200);
    const response = data as { data: any[]; rejectedIds: string[]; invitesSentCount: number };
    expect(response.invitesSentCount).toBe(1);
    expect(response.rejectedIds).toHaveLength(0);

    const inactiveMemberships = await getInactiveMemberships(organization.id);
    expect(inactiveMemberships).toHaveLength(1);
    expect(inactiveMemberships[0].userId).toBe(existingUser.id);
    expect(inactiveMemberships[0].role).toBe('admin');
  });

  it('should handle mixed existing and new users', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();
    const existingUser = await createTestUser('existing@example.com');

    const { response: res, data } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      { emails: ['existing@example.com', 'newuser@example.com'], role: 'member' },
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

  it('should assign admin role correctly', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();

    const { response: res } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      { emails: ['user@example.com'], role: 'admin' },
      sessionCookie,
    );

    expect(res.status).toBe(200);

    const inactiveMemberships = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.organizationId, organization.id));
    expect(inactiveMemberships).toHaveLength(1);
    expect(inactiveMemberships[0].role).toBe('admin');
  });

  it('should assign member role correctly', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();

    const { response: res } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      { emails: ['user@example.com'], role: 'member' },
      sessionCookie,
    );

    expect(res.status).toBe(200);

    const inactiveMemberships = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.organizationId, organization.id));
    expect(inactiveMemberships).toHaveLength(1);
    expect(inactiveMemberships[0].role).toBe('member');
  });

  it('should reject invitations without authentication', async () => {
    const organization = await createTestOrganization();

    const { response: res } = await call(membershipInvite, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      body: { emails: ['user@example.com'], role: 'member' },
      query: { entityId: organization.id, entityType: 'organization' as const },
      headers: defaultHeaders,
    });

    expect(res.status).toBe(401);
  });

  it('should reject invitations from non-org members', async () => {
    const organization = await createTestOrganization();

    const user = await createTestUser('user@example.com');
    const sessionCookie = await createTestSession(user);

    const { response: res } = await makeInviteRequest(
      organization.tenantId,
      organization.id,
      { emails: ['newuser@example.com'], role: 'member' },
      sessionCookie,
    );

    expect(res.status).toBe(403);
  });

  it('should handle already invited users', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();

    const inviteData = { emails: ['user@example.com'], role: 'member' };

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
});
