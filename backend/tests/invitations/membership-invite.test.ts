import { eq } from 'drizzle-orm';
import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '#/db/db';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { mockOrganization } from '../../mocks/basic';
import { defaultHeaders } from '../fixtures';
import { createOrganizationAdminUser, createPasswordUser, parseResponse } from '../helpers';
import { clearDatabase, migrateDatabase, mockFetchRequest, mockRateLimiter, setTestConfig } from '../setup';

setTestConfig({
  enabledAuthStrategies: ['password'],
  registrationEnabled: true,
});

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase();

  // Mock email sending functions
  vi.mock('#/modules/memberships/handlers', async () => {
    const actual = await vi.importActual('#/modules/memberships/handlers');
    return {
      ...actual,
      MemberInviteEmail: vi.fn().mockResolvedValue(undefined),
      MemberInviteWithTokenEmail: vi.fn().mockResolvedValue(undefined),
    };
  });

  mockRateLimiter();
});

afterEach(async () => await clearDatabase());

describe('Membership Invitation', async () => {
  const { default: app } = await import('#/routes');
  const client = testClient(app) as any;

  const createOrgAndAdmin = async () => {
    const organizationData = mockOrganization();
    const [organization] = await db.insert(organizationsTable).values(organizationData).returning();
    await createOrganizationAdminUser('admin@cella.com', 'adminPassword123!', organization.id);

    const signInRes = await client['auth']['sign-in'].$post(
      { json: { email: 'admin@cella.com', password: 'adminPassword123!' } },
      { headers: defaultHeaders },
    );

    return { organization, sessionCookie: signInRes.headers.get('set-cookie') };
  };

  const makeInviteRequest = async (organizationId: string, inviteData: any, sessionCookie: string | null) => {
    return await client[organizationId]['memberships'].$post(
      { json: inviteData, query: { idOrSlug: organizationId, entityType: 'organization' } },
      {
        headers: {
          ...defaultHeaders,
          Cookie: sessionCookie || '',
        },
      },
    );
  };

  const getInactiveMemberships = async (organizationId: string) => {
    return await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.organizationId, organizationId));
  };

  it('should invite new users to organization', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();

    const res = await makeInviteRequest(
      organization.id,
      { emails: ['user1@cella.com', 'user2@cella.com'], role: 'member' },
      sessionCookie,
    );

    expect(res.status).toBe(200);
    const response = await parseResponse<{ success: boolean; rejectedItems: string[]; invitesSentCount: number }>(res);
    expect(response.success).toBe(true);
    expect(response.invitesSentCount).toBe(2);
    expect(response.rejectedItems).toHaveLength(0);

    const inactiveMemberships = await getInactiveMemberships(organization.id);
    expect(inactiveMemberships).toHaveLength(2);
    expect(inactiveMemberships[0].email).toBe('user1@cella.com');
    expect(inactiveMemberships[1].email).toBe('user2@cella.com');
    expect(inactiveMemberships[0].role).toBe('member');
    expect(inactiveMemberships[1].role).toBe('member');
  });

  it('should invite existing users to organization', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();
    const existingUser = await createPasswordUser('existing@cella.com', 'password123!');

    const res = await makeInviteRequest(
      organization.id,
      { emails: ['existing@cella.com'], role: 'admin' },
      sessionCookie,
    );

    expect(res.status).toBe(200);
    const response = await parseResponse<{ success: boolean; rejectedItems: string[]; invitesSentCount: number }>(res);
    expect(response.success).toBe(true);
    expect(response.invitesSentCount).toBe(1);
    expect(response.rejectedItems).toHaveLength(0);

    const inactiveMemberships = await getInactiveMemberships(organization.id);
    expect(inactiveMemberships).toHaveLength(1);
    expect(inactiveMemberships[0].userId).toBe(existingUser.id);
    expect(inactiveMemberships[0].role).toBe('admin');
  });

  it('should handle mixed existing and new users', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();
    const existingUser = await createPasswordUser('existing@cella.com', 'password123!');

    const res = await makeInviteRequest(
      organization.id,
      { emails: ['existing@cella.com', 'newuser@cella.com'], role: 'member' },
      sessionCookie,
    );

    expect(res.status).toBe(200);
    const response = await parseResponse<{ success: boolean; rejectedItems: string[]; invitesSentCount: number }>(res);
    expect(response.success).toBe(true);
    expect(response.invitesSentCount).toBe(2);
    expect(response.rejectedItems).toHaveLength(0);

    const inactiveMemberships = await getInactiveMemberships(organization.id);
    expect(inactiveMemberships).toHaveLength(2);

    const existingUserMembership = inactiveMemberships.find((im) => im.userId === existingUser.id);
    const newUserMembership = inactiveMemberships.find((im) => im.userId === null);

    expect(existingUserMembership).toBeDefined();
    expect(newUserMembership).toBeDefined();
    expect(existingUserMembership?.email).toBe('existing@cella.com');
    expect(newUserMembership?.email).toBe('newuser@cella.com');
  });

  it('should assign admin role correctly', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();

    const res = await makeInviteRequest(organization.id, { emails: ['user@cella.com'], role: 'admin' }, sessionCookie);

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

    const res = await makeInviteRequest(organization.id, { emails: ['user@cella.com'], role: 'member' }, sessionCookie);

    expect(res.status).toBe(200);

    const inactiveMemberships = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.organizationId, organization.id));
    expect(inactiveMemberships).toHaveLength(1);
    expect(inactiveMemberships[0].role).toBe('member');
  });

  it('should reject invitations without authentication', async () => {
    const organizationData = mockOrganization();
    const [organization] = await db.insert(organizationsTable).values(organizationData).returning();

    const res = await client[organization.id]['memberships'].$post(
      { json: { emails: ['user@cella.com'], role: 'member' }, query: { entityType: 'organization' } },
      { headers: defaultHeaders },
    );

    expect(res.status).toBe(401);
  });

  it('should reject invitations from non-org members', async () => {
    const organizationData = mockOrganization();
    const [organization] = await db.insert(organizationsTable).values(organizationData).returning();

    await createPasswordUser('user@cella.com', 'password123!');
    const signInRes = await client['auth']['sign-in'].$post(
      { json: { email: 'user@cella.com', password: 'password123!' } },
      { headers: defaultHeaders },
    );

    const res = await makeInviteRequest(
      organization.id,
      { emails: ['newuser@cella.com'], role: 'member' },
      signInRes.headers.get('set-cookie'),
    );

    expect(res.status).toBe(403);
  });

  it('should handle already invited users', async () => {
    const { organization, sessionCookie } = await createOrgAndAdmin();

    const inviteData = { emails: ['user@cella.com'], role: 'member' };

    const firstRes = await makeInviteRequest(organization.id, inviteData, sessionCookie);
    expect(firstRes.status).toBe(200);

    const secondRes = await makeInviteRequest(organization.id, inviteData, sessionCookie);
    expect(secondRes.status).toBe(200);

    const response = await parseResponse<{ success: boolean; rejectedItems: string[]; invitesSentCount: number }>(
      secondRes,
    );
    expect(response.success).toBe(false);
    expect(response.invitesSentCount).toBe(0);
    expect(response.rejectedItems).toHaveLength(0);
  });
});
