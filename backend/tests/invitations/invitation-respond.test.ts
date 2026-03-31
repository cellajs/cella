import { eq } from 'drizzle-orm';
import { handleMembershipInvitation, signIn } from 'sdk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';
import { defaultHeaders } from '../fixtures';
import { createPasswordUser, createTestOrganization } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';
import { createMembershipInvitationToken } from './helpers';

vi.mock('#/middlewares/rate-limiter/core', async () => (await import('../test-utils')).rateLimiterCoreMock());
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) =>
  (await import('../test-utils')).rateLimiterHelpersMock(importOriginal),
);

setTestConfig({
  enabledAuthStrategies: ['password'],
  registrationEnabled: true,
});

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => await clearDatabase());

describe('Invitation response', async () => {
  const call = await createAppClient();

  async function createOrg() {
    return await createTestOrganization();
  }

  async function signInUser(email: string, password: string) {
    const { response: signInRes } = await call(signIn, {
      body: { email, password },
      headers: defaultHeaders,
    });
    return signInRes.headers.get('set-cookie') || '';
  }

  async function respondToInvitation(inactiveMembershipId: string, action: 'accept' | 'reject', sessionCookie: string) {
    return await call(handleMembershipInvitation, {
      path: { id: inactiveMembershipId, acceptOrReject: action },
      headers: {
        ...defaultHeaders,
        Cookie: sessionCookie,
      },
    });
  }

  it('should accept for existing user', async () => {
    const organization = await createOrg();
    const invitedUser = await createPasswordUser('invited@example.com', 'password123!');

    const { inactiveMembership } = await createMembershipInvitationToken(
      invitedUser,
      organization.id,
      'member',
      organization.tenantId,
    );
    const sessionCookie = await signInUser('invited@example.com', 'password123!');

    const { response: res } = await respondToInvitation(inactiveMembership.id!, 'accept', sessionCookie);

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

  it('should accept with admin role', async () => {
    const organization = await createOrg();
    const invitedUser = await createPasswordUser('invited@example.com', 'password123!');

    const { inactiveMembership } = await createMembershipInvitationToken(
      invitedUser,
      organization.id,
      'admin',
      organization.tenantId,
    );
    const sessionCookie = await signInUser('invited@example.com', 'password123!');

    const { response: res } = await respondToInvitation(inactiveMembership.id!, 'accept', sessionCookie);

    expect(res.status).toBe(200);

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, invitedUser.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe('admin');
  });

  it('should reject invitation', async () => {
    const organization = await createOrg();
    const invitedUser = await createPasswordUser('invited@example.com', 'password123!');

    const { inactiveMembership } = await createMembershipInvitationToken(
      invitedUser,
      organization.id,
      'member',
      organization.tenantId,
    );
    const sessionCookie = await signInUser('invited@example.com', 'password123!');

    const { response: res } = await respondToInvitation(inactiveMembership.id!, 'reject', sessionCookie);

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
    await createOrg();
    await createPasswordUser('user@example.com', 'password123!');

    const sessionCookie = await signInUser('user@example.com', 'password123!');

    const { response: res } = await call(handleMembershipInvitation, {
      path: { id: 'non-existent-id', acceptOrReject: 'accept' },
      headers: {
        ...defaultHeaders,
        Cookie: sessionCookie,
      },
    });

    expect(res.status).toBe(404);
  });

  it('should reject for already processed invitation', async () => {
    const organization = await createOrg();
    const invitedUser = await createPasswordUser('invited@example.com', 'password123!');

    const { inactiveMembership } = await createMembershipInvitationToken(
      invitedUser,
      organization.id,
      'member',
      organization.tenantId,
    );
    const sessionCookie = await signInUser('invited@example.com', 'password123!');

    const { response: firstRes } = await respondToInvitation(inactiveMembership.id!, 'accept', sessionCookie);
    expect(firstRes.status).toBe(200);

    const { response: secondRes } = await respondToInvitation(inactiveMembership.id!, 'accept', sessionCookie);
    expect(secondRes.status).toBe(404);
  });
});
