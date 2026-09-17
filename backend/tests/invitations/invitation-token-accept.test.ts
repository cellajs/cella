import { eq } from 'drizzle-orm';
import { acceptInvitationToken, invokeToken } from 'sdk';
import { appConfig, hierarchy } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { tokensTable } from '#/modules/auth/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { createOrganizationAdminUser, createTestOrganization, createTestSession, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';
import { createInvokedInvitationToken } from './helpers';

vi.mock('#/lib/mailer', () => ({
  mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) },
}));

const memberRole = hierarchy.getLeastPrivilegedRole('organization');
const invitedEmail = 'invited-address@example.com';

setTestConfig({ enabledAuthStrategies: ['passkey', 'magic'], selfRegistration: true });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
  vi.clearAllMocks();
});

describe('Accept an invitation token as the signed-in user', async () => {
  const call = await createAppClient();

  /** An organization, its inviter, and an opened invitation for an address nobody has an account on. */
  const setup = async (opts: { userId?: string | null } = {}) => {
    const organization = await createTestOrganization();
    const inviter = await createTestUser('inviter@example.com');
    const invitation = await createInvokedInvitationToken({
      email: invitedEmail,
      organization,
      createdBy: inviter.id,
      ...opts,
    });
    return { organization, inviter, ...invitation };
  };

  const accept = (cookies: string[]) =>
    call(acceptInvitationToken, { headers: { ...defaultHeaders, Cookie: cookies.join('; ') } });

  const membershipsOf = (userId: string) =>
    db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));

  it('activates the membership for the session user, spends the invitation and notifies the invited address', async () => {
    const { organization, token, inactiveMembership, invitationCookie } = await setup();
    const me = await createTestUser('my-account@example.com');
    const sessionCookie = await createTestSession(me);

    const { response, data } = await accept([sessionCookie, invitationCookie]);

    expect(response.status).toBe(200);
    expect((data as { id: string }).id).toBe(organization.id);

    const memberships = await membershipsOf(me.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0].organizationId).toBe(organization.id);
    expect(memberships[0].role).toBe(memberRole);

    expect(
      await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id)),
    ).toHaveLength(0);
    expect(await db.select().from(tokensTable).where(eq(tokensTable.id, token.id))).toHaveLength(0);

    // The invited inbox may not belong to the accepting account, so it hears about the acceptance.
    expect(mailer.prepareEmails).toHaveBeenCalledTimes(1);
    const [, statics, recipients] = vi.mocked(mailer.prepareEmails).mock.calls[0];
    expect(statics).toMatchObject({
      type: 'invitation-accepted-elsewhere',
      details: { accountEmail: 'my-account@example.com' },
    });
    expect(recipients).toEqual([expect.objectContaining({ email: invitedEmail })]);
  });

  it('cannot be replayed once accepted', async () => {
    const { invitationCookie } = await setup();
    const me = await createTestUser('my-account@example.com');
    const other = await createTestUser('other-account@example.com');

    const first = await accept([await createTestSession(me), invitationCookie]);
    expect(first.response.status).toBe(200);

    const replay = await accept([await createTestSession(other), invitationCookie]);
    expect(replay.response.status).toBe(404);
    expect(await membershipsOf(other.id)).toHaveLength(0);
  });

  it('refuses an invitation already bound to another user (GHSA-fmh4-wcc4-5jm3)', async () => {
    const owner = await createTestUser('owner@example.com');
    const organization = await createTestOrganization();
    // The row is bound to its owner while the token was never linked: possession of the link must not be enough.
    const { inactiveMembership, invitationCookie } = await createInvokedInvitationToken({
      email: invitedEmail,
      organization,
      createdBy: owner.id,
    });
    await db
      .update(inactiveMembershipsTable)
      .set({ userId: owner.id })
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id));

    const attacker = await createTestUser('attacker@example.com');
    const { response } = await accept([await createTestSession(attacker), invitationCookie]);

    expect(response.status).toBe(404);
    expect(await membershipsOf(attacker.id)).toHaveLength(0);
    const [still] = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id));
    expect(still.userId).toBe(owner.id);
  });

  it('refuses a token already linked to another user', async () => {
    const owner = await createTestUser('owner@example.com');
    const { invitationCookie } = await setup({ userId: owner.id });

    const attacker = await createTestUser('attacker@example.com');
    const { response } = await accept([await createTestSession(attacker), invitationCookie]);

    expect(response.status).toBe(409);
    expect(await membershipsOf(attacker.id)).toHaveLength(0);
  });

  it('accepts without a notice when the invitation is bound to the accepting user', async () => {
    const me = await createTestUser(invitedEmail);
    const { invitationCookie } = await setup({ userId: me.id });

    const { response } = await accept([await createTestSession(me), invitationCookie]);

    expect(response.status).toBe(200);
    expect(await membershipsOf(me.id)).toHaveLength(1);
    expect(mailer.prepareEmails).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    const { invitationCookie, inactiveMembership } = await setup();

    const { response } = await accept([invitationCookie]);

    expect(response.status).toBe(401);
    expect(
      await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id)),
    ).toHaveLength(1);
  });

  it('requires the single-use invitation cookie', async () => {
    await setup();
    const me = await createTestUser('my-account@example.com');

    const { response } = await accept([await createTestSession(me)]);

    expect(response.status).toBe(400);
    expect(await membershipsOf(me.id)).toHaveLength(0);
  });

  it('refuses an expired token', async () => {
    const { token, invitationCookie } = await setup();
    await db
      .update(tokensTable)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(tokensTable.id, token.id));
    const me = await createTestUser('my-account@example.com');

    const { response } = await accept([await createTestSession(me), invitationCookie]);

    expect(response.status).toBe(401);
    expect(await membershipsOf(me.id)).toHaveLength(0);
  });

  it('lets exactly one of two racing accounts win', async () => {
    const { invitationCookie } = await setup();
    const first = await createTestUser('first@example.com');
    const second = await createTestUser('second@example.com');
    const [firstSession, secondSession] = await Promise.all([createTestSession(first), createTestSession(second)]);

    const results = await Promise.all([
      accept([firstSession, invitationCookie]),
      accept([secondSession, invitationCookie]),
    ]);

    expect(results.filter((r) => r.response.status === 200)).toHaveLength(1);
    const total = (await membershipsOf(first.id)).length + (await membershipsOf(second.id)).length;
    expect(total).toBe(1);
  });

  it('spends the invitation without a duplicate membership when the user is already a member', async () => {
    const organization = await createTestOrganization();
    const me = await createOrganizationAdminUser(
      'my-account@example.com',
      organization.id,
      'admin',
      true,
      organization.tenantId,
    );
    const { inactiveMembership, invitationCookie } = await createInvokedInvitationToken({
      email: invitedEmail,
      organization,
      createdBy: me.id,
    });

    const { response } = await accept([await createTestSession(me), invitationCookie]);

    expect(response.status).toBe(200);
    const memberships = await membershipsOf(me.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe('admin');
    expect(
      await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id)),
    ).toHaveLength(0);
  });
});

describe('Opening a token link while signed in', async () => {
  const call = await createAppClient();

  const insertToken = async (values: { type: 'invitation' | 'magic'; email: string; userId: string | null }) => {
    const raw = nanoid(40);
    await db.insert(tokensTable).values({
      secret: hashToken(raw),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      ...values,
    });
    return raw;
  };

  it('lets a signed-in user open an invitation that is not bound to anyone', async () => {
    const me = await createTestUser('my-account@example.com');
    const raw = await insertToken({ type: 'invitation', email: invitedEmail, userId: null });

    const { response } = await call(invokeToken, {
      path: { type: 'invitation', token: raw },
      headers: { ...defaultHeaders, Cookie: await createTestSession(me) },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain(`${appConfig.frontendUrl}/auth/authenticate?tokenId=`);
  });

  it('still refuses an invitation linked to another user', async () => {
    const owner = await createTestUser('owner@example.com');
    const me = await createTestUser('my-account@example.com');
    const raw = await insertToken({ type: 'invitation', email: owner.email, userId: owner.id });

    const { response } = await call(invokeToken, {
      path: { type: 'invitation', token: raw },
      headers: { ...defaultHeaders, Cookie: await createTestSession(me) },
    });

    expect(response.status).toBe(400);
  });

  it("still refuses another user's magic link", async () => {
    const owner = await createTestUser('owner@example.com');
    const me = await createTestUser('my-account@example.com');
    const raw = await insertToken({ type: 'magic', email: owner.email, userId: owner.id });

    const { response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: await createTestSession(me) },
    });

    expect(response.status).toBe(400);
  });
});
