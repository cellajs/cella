import { eq } from 'drizzle-orm';
import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '#/db/db';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { mockOrganization } from '../../mocks/basic';
import { defaultHeaders } from '../fixtures';
import { createPasswordUser } from '../helpers';
import { clearDatabase, migrateDatabase, mockFetchRequest, mockRateLimiter, setTestConfig } from '../setup';
import { createMembershipInvitationToken } from './helpers';

setTestConfig({
  enabledAuthStrategies: ['password'],
  registrationEnabled: true,
});

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase();
  mockRateLimiter();
});

afterEach(async () => await clearDatabase());

describe('Invitation response', async () => {
  const { default: app } = await import('#/routes');
  const client = testClient(app) as any;

  async function createOrg() {
    const organizationData = mockOrganization();
    const [organization] = await db.insert(organizationsTable).values(organizationData).returning();
    return organization;
  }

  async function signInUser(email: string, password: string) {
    const signInRes = await client['auth']['sign-in'].$post({ json: { email, password } }, { headers: defaultHeaders });
    return signInRes.headers.get('set-cookie') || '';
  }

  async function respondToInvitation(
    organizationId: string,
    inactiveMembershipId: string,
    action: 'accept' | 'reject',
    sessionCookie: string,
  ) {
    return await (client as any)[organizationId]['memberships'][inactiveMembershipId][action].$post(
      {},
      {
        headers: {
          ...defaultHeaders,
          Cookie: sessionCookie,
        },
      },
    );
  }

  it('accept for existing user', async () => {
    const organization = await createOrg();
    const invitedUser = await createPasswordUser('invited@cella.com', 'password123!');

    const { inactiveMembership } = await createMembershipInvitationToken(invitedUser, organization.id, 'member');
    const sessionCookie = await signInUser('invited@cella.com', 'password123!');

    const res = await respondToInvitation(organization.id, inactiveMembership.id!, 'accept', sessionCookie);

    expect(res.status).toBe(200);

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, invitedUser.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].organizationId).toBe(organization.id);
    expect(memberships[0].role).toBe('member');

    const remainingInactive = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id!));
    expect(remainingInactive).toHaveLength(0);
  });

  it('accept with admin role', async () => {
    const organization = await createOrg();
    const invitedUser = await createPasswordUser('invited@cella.com', 'password123!');

    const { inactiveMembership } = await createMembershipInvitationToken(invitedUser, organization.id, 'admin');
    const sessionCookie = await signInUser('invited@cella.com', 'password123!');

    const res = await respondToInvitation(organization.id, inactiveMembership.id!, 'accept', sessionCookie);

    expect(res.status).toBe(200);

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, invitedUser.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe('admin');
  });

  it('reject', async () => {
    const organization = await createOrg();
    const invitedUser = await createPasswordUser('invited@cella.com', 'password123!');

    const { inactiveMembership } = await createMembershipInvitationToken(invitedUser, organization.id, 'member');
    const sessionCookie = await signInUser('invited@cella.com', 'password123!');

    const res = await respondToInvitation(organization.id, inactiveMembership.id!, 'reject', sessionCookie);

    expect(res.status).toBe(200);

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, invitedUser.id));
    expect(memberships).toHaveLength(0);

    // Check that inactive membership is marked as rejected
    const rejectedInactive = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id!));
    expect(rejectedInactive).toHaveLength(1);
    expect(rejectedInactive[0].rejectedAt).toBeDefined();
  });

  it('should reject for non-existent invitation', async () => {
    const organization = await createOrg();
    await createPasswordUser('user@cella.com', 'password123!');

    const sessionCookie = await signInUser('user@cella.com', 'password123!');

    const res = await client[organization.id]['memberships']['non-existent-id']['accept'].$post(
      {},
      {
        headers: {
          ...defaultHeaders,
          Cookie: sessionCookie,
        },
      },
    );

    expect(res.status).toBe(404);
  });

  it('should reject for already processed invitation', async () => {
    const organization = await createOrg();
    const invitedUser = await createPasswordUser('invited@cella.com', 'password123!');

    const { inactiveMembership } = await createMembershipInvitationToken(invitedUser, organization.id, 'member');
    const sessionCookie = await signInUser('invited@cella.com', 'password123!');

    const firstRes = await respondToInvitation(organization.id, inactiveMembership.id!, 'accept', sessionCookie);
    expect(firstRes.status).toBe(200);

    const secondRes = await respondToInvitation(organization.id, inactiveMembership.id!, 'accept', sessionCookie);
    expect(secondRes.status).toBe(404);
  });
});
