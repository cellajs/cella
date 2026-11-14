import { eq } from 'drizzle-orm';
import { acceptInvitation, declineInvitation, invokeToken } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { tokensTable } from '#/modules/auth/tokens/tokens-db';
import { invitationsTable } from '#/modules/memberships/invitations-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { channelBaseSchema } from '#/schemas/entity-base';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { createTestOrganization, createTestSession, createTestUser, expectRefusal, rawJsonRequest } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';
import { createInvitation, readMembersAs } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'], selfRegistration: true });

afterEach(async () => await clearDatabase());

describe('Invitation response', async () => {
  const call = await createAppClient();

  async function createOrg() {
    return await createTestOrganization();
  }

  async function respondToInvitation(invitationId: string, action: 'accept' | 'decline', sessionCookie: string) {
    return await call(action === 'accept' ? acceptInvitation : declineInvitation, {
      path: { invitationId: invitationId },
      headers: { ...defaultHeaders, Cookie: sessionCookie },
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

    const remainingInactive = await db.select().from(invitationsTable).where(eq(invitationsTable.id, inactiveMembership.id!));
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
    const readMembers = () => readMembersAs(organization, sessionCookie);
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
      role: adminRole,
    });
    const sessionCookie = await createTestSession(invitedUser);

    const { response: res } = await respondToInvitation(inactiveMembership.id!, 'accept', sessionCookie);

    expect(res.status).toBe(200);

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, invitedUser.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe(adminRole);
  });

  it('should decline invitation', async () => {
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

    const { response: res } = await respondToInvitation(inactiveMembership.id!, 'decline', sessionCookie);

    expect(res.status).toBe(200);

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, invitedUser.id));
    expect(memberships).toHaveLength(0);

    const declinedInactive = await db.select().from(invitationsTable).where(eq(invitationsTable.id, inactiveMembership.id!));
    expect(declinedInactive).toHaveLength(1);
    expect(declinedInactive[0].declinedAt).toBeDefined();
  });

  it('answers a declining invitee with the organization as a channel base, without its settings or writers', async () => {
    const organization = await createOrg();
    const invitedUser = await createTestUser('invited@example.com');
    const { inactiveMembership } = await createInvitation({
      organization,
      email: invitedUser.email,
      createdBy: invitedUser.id,
      boundTo: invitedUser.id,
    });

    const path = `/me/invitations/${inactiveMembership.id}:decline`;
    const { status, body } = await rawJsonRequest(path, await createTestSession(invitedUser), { method: 'POST' });

    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(channelBaseSchema.keyof().options.toSorted());
  });

  it("retires a declined invitation's emailed link", async () => {
    const organization = await createOrg();
    const invitedUser = await createTestUser('invited@example.com');
    const { inactiveMembership, rawToken } = await createInvitation({
      organization,
      email: invitedUser.email,
      createdBy: invitedUser.id,
      boundTo: invitedUser.id,
      role: memberRole,
    });

    const { response: res } = await respondToInvitation(inactiveMembership.id, 'decline', await createTestSession(invitedUser));
    expect(res.status).toBe(200);

    expect(await db.select().from(tokensTable).where(eq(tokensTable.invitationId, inactiveMembership.id))).toHaveLength(0);
    const { response, error } = await call(invokeToken, { path: { kind: 'invitation', token: rawToken }, headers: defaultHeaders });
    await expectRefusal({ response, error }, 401, 'invitation_not_found');
  });

  it('should reject for non-existent invitation', async () => {
    await createOrg();
    const user = await createTestUser('user@example.com');

    const sessionCookie = await createTestSession(user);

    const { response: res } = await call(acceptInvitation, {
      path: { invitationId: '00000000-0000-0000-0000-000000000000' },
      headers: { ...defaultHeaders, Cookie: sessionCookie },
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
    const unbound = await createInvitation({ organization, email: 'nobody@example.com', createdBy: invitedUser.id, role: memberRole });

    for (const { inactiveMembership } of [bound, unbound]) {
      const { response: res } = await respondToInvitation(inactiveMembership.id, 'accept', attackerSession);
      expect(res.status).toBe(404);
    }

    const attackerMemberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, attacker.id));
    expect(attackerMemberships).toHaveLength(0);

    const stillInactive = await db.select().from(invitationsTable);
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
