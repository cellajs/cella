import { eq } from 'drizzle-orm';
import { getMembers, handleMembershipInvitation, invokeToken } from 'sdk';
import { hierarchy } from 'shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization, createTestSession, createTestUser, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';
import { createInvitation } from './helpers';

/** The organization vocabulary's floor role: `member` in cella; apps with other vocabularies still run this file unchanged. */
const memberRole = hierarchy.getLeastPrivilegedRole('organization');

setTestConfig({
  enabledAuthStrategies: ['passkey'],
  selfRegistration: true,
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
    const invitedUser = await createTestUser('invited@example.com');

    const { inactiveMembership } = await createInvitation({
      organization,
      email: invitedUser.email,
      createdBy: invitedUser.id,
      boundTo: invitedUser.id,
      role: memberRole,
    });
    const sessionCookie = await createTestSession(invitedUser);

    const { response: res } = await respondToInvitation(inactiveMembership.id!, 'accept', sessionCookie);

    expect(res.status).toBe(200);

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, invitedUser.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].organizationId).toBe(organization.id);
    expect(memberships[0].role).toBe(memberRole);

    const remainingInactive = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id!));
    expect(remainingInactive).toHaveLength(0);
  });

  it('lets the new member into the organization right after accepting', async () => {
    const organization = await createOrg();
    const invitedUser = await createTestUser('invited@example.com');
    const { inactiveMembership } = await createInvitation({
      organization,
      email: invitedUser.email,
      createdBy: invitedUser.id,
      boundTo: invitedUser.id,
      role: memberRole,
    });
    const sessionCookie = await createTestSession(invitedUser);
    const readMembers = () =>
      call(getMembers, {
        path: { tenantId: organization.tenantId, organizationId: organization.id },
        query: { entityId: organization.id, entityType: 'organization' },
        headers: { ...defaultHeaders, Cookie: sessionCookie },
      });

    // The tenant refuses while invited only: the user holds no membership in it yet, so the tenant guard answers.
    expect((await readMembers()).response.status).toBe(403);

    const { response: res } = await respondToInvitation(inactiveMembership.id, 'accept', sessionCookie);
    expect(res.status).toBe(200);

    expect((await readMembers()).response.status).toBe(200);
  });

  it('should accept with admin role', async () => {
    const organization = await createOrg();
    const invitedUser = await createTestUser('invited@example.com');

    const { inactiveMembership } = await createInvitation({
      organization,
      email: invitedUser.email,
      createdBy: invitedUser.id,
      boundTo: invitedUser.id,
      role: 'admin',
    });
    const sessionCookie = await createTestSession(invitedUser);

    const { response: res } = await respondToInvitation(inactiveMembership.id!, 'accept', sessionCookie);

    expect(res.status).toBe(200);

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, invitedUser.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe('admin');
  });

  it('should reject invitation', async () => {
    const organization = await createOrg();
    const invitedUser = await createTestUser('invited@example.com');

    const { inactiveMembership } = await createInvitation({
      organization,
      email: invitedUser.email,
      createdBy: invitedUser.id,
      boundTo: invitedUser.id,
      role: memberRole,
    });
    const sessionCookie = await createTestSession(invitedUser);

    const { response: res } = await respondToInvitation(inactiveMembership.id!, 'reject', sessionCookie);

    expect(res.status).toBe(200);

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, invitedUser.id));
    expect(memberships).toHaveLength(0);

    const rejectedInactive = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id!));
    expect(rejectedInactive).toHaveLength(1);
    expect(rejectedInactive[0].rejectedAt).toBeDefined();
  });

  it("retires a rejected invitation's emailed link", async () => {
    const organization = await createOrg();
    const invitedUser = await createTestUser('invited@example.com');
    const { inactiveMembership, rawToken } = await createInvitation({
      organization,
      email: invitedUser.email,
      createdBy: invitedUser.id,
      boundTo: invitedUser.id,
      role: memberRole,
    });

    const { response: res } = await respondToInvitation(
      inactiveMembership.id,
      'reject',
      await createTestSession(invitedUser),
    );
    expect(res.status).toBe(200);

    expect(
      await db.select().from(tokensTable).where(eq(tokensTable.inactiveMembershipId, inactiveMembership.id)),
    ).toHaveLength(0);
    const { response, error } = await call(invokeToken, {
      path: { type: 'invitation', token: rawToken },
      headers: defaultHeaders,
    });
    await expectRefusal({ response, error }, 401, 'invitation_not_found');
  });

  it('should reject for non-existent invitation', async () => {
    await createOrg();
    const user = await createTestUser('user@example.com');

    const sessionCookie = await createTestSession(user);

    const { response: res } = await call(handleMembershipInvitation, {
      path: { id: '00000000-0000-0000-0000-000000000000', acceptOrReject: 'accept' },
      headers: {
        ...defaultHeaders,
        Cookie: sessionCookie,
      },
    });

    expect(res.status).toBe(404);
  });

  it("must not accept someone else's invitation by id, whether bound to them or to nobody yet", async () => {
    const organization = await createOrg();
    const invitedUser = await createTestUser('invited@example.com');
    const attacker = await createTestUser('attacker@example.com');
    const attackerSession = await createTestSession(attacker);

    // GHSA-fmh4-wcc4-5jm3: by id alone an invitation is answerable by its bound user only. One sent to an address
    // without an account is bound to nobody: only its emailed token claims it, never its id.
    const bound = await createInvitation({
      organization,
      email: invitedUser.email,
      createdBy: invitedUser.id,
      boundTo: invitedUser.id,
      role: memberRole,
    });
    const unbound = await createInvitation({
      organization,
      email: 'nobody@example.com',
      createdBy: invitedUser.id,
      role: memberRole,
    });

    for (const { inactiveMembership } of [bound, unbound]) {
      const { response: res } = await respondToInvitation(inactiveMembership.id, 'accept', attackerSession);
      expect(res.status).toBe(404);
    }

    const attackerMemberships = await db
      .select()
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, attacker.id));
    expect(attackerMemberships).toHaveLength(0);

    const stillInactive = await db.select().from(inactiveMembershipsTable);
    expect(stillInactive.find((row) => row.id === bound.inactiveMembership.id)?.userId).toBe(invitedUser.id);
    expect(stillInactive.find((row) => row.id === unbound.inactiveMembership.id)?.userId).toBeNull();
  });

  it('should reject for already processed invitation', async () => {
    const organization = await createOrg();
    const invitedUser = await createTestUser('invited@example.com');

    const { inactiveMembership } = await createInvitation({
      organization,
      email: invitedUser.email,
      createdBy: invitedUser.id,
      boundTo: invitedUser.id,
      role: memberRole,
    });
    const sessionCookie = await createTestSession(invitedUser);

    const { response: firstRes } = await respondToInvitation(inactiveMembership.id!, 'accept', sessionCookie);
    expect(firstRes.status).toBe(200);

    const { response: secondRes } = await respondToInvitation(inactiveMembership.id!, 'accept', sessionCookie);
    expect(secondRes.status).toBe(404);
  });
});
