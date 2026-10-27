import { eq } from 'drizzle-orm';
import { acceptInvitationToken, confirmInvitationAddress, invokeToken } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { tokensTable } from '#/modules/auth/tokens/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import {
  authCookie,
  createOrganizationAdminUser,
  createTestOrganization,
  createTestSession,
  createTestUser,
  insertTestToken,
  mailedLink,
  sentMails,
  setCookiePair,
} from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';
import { createInvitation, readMembersAs } from './helpers';

const invitedEmail = 'invited-address@example.com';

setTestConfig({ enabledAuthStrategies: ['passkey', 'magic'], selfRegistration: true });

afterEach(async () => await clearDatabase());

describe('Accept an invitation token as the signed-in user', async () => {
  const call = await createAppClient();

  /** An organization, its inviter, and an opened invitation for an address nobody has an account on. */
  const setup = async (opts: { boundTo?: string | null } = {}) => {
    const organization = await createTestOrganization();
    const inviter = await createTestUser('inviter@example.com');
    const invitation = await createInvitation({ token: 'invoked', email: invitedEmail, organization, createdBy: inviter.id, ...opts });
    return { organization, inviter, ...invitation };
  };

  const accept = (cookies: string[]) => call(acceptInvitationToken, { headers: { ...defaultHeaders, Cookie: cookies.join('; ') } });

  const membershipsOf = (userId: string) => db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));

  it('activates the membership for the account holding the invited address and spends the invitation', async () => {
    const { organization, token, inactiveMembership, invitationCookie } = await setup();
    const me = await createTestUser(invitedEmail);
    const sessionCookie = await createTestSession(me);

    const { response, data } = await accept([sessionCookie, invitationCookie]);

    expect(response.status).toBe(200);
    expect((data as { id: string }).id).toBe(organization.id);

    const memberships = await membershipsOf(me.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0].organizationId).toBe(organization.id);
    expect(memberships[0].role).toBe(memberRole);

    expect(await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id))).toHaveLength(0);
    expect(await db.select().from(tokensTable).where(eq(tokensTable.id, token.id))).toHaveLength(0);
  });

  it('refuses a forwarded link opened by another account, and its confirmation goes only to the invited inbox', async () => {
    const { token, invitationCookie } = await setup();
    const other = await createTestUser('forwarded-to@example.com');
    const cookies = [await createTestSession(other), invitationCookie];

    const { response, error } = await accept(cookies);
    expect(response.status).toBe(403);
    expect(error).toMatchObject({ type: 'invitation_address_unproven' });

    const confirm = await call(confirmInvitationAddress, { headers: { ...defaultHeaders, Cookie: cookies.join('; ') } });
    expect(confirm.response.status).toBe(204);
    expect(sentMails().map(({ recipient }) => recipient.email)).toEqual([invitedEmail]);
    // The new link replaces the forwarded one, which can no longer be used by anyone.
    expect(await db.select().from(tokensTable).where(eq(tokensTable.id, token.id))).toHaveLength(0);
    expect(await membershipsOf(other.id)).toHaveLength(0);
  });

  it('lets the account that opens the confirmation link from the invited inbox join, holding the address', async () => {
    const { organization, invitationCookie } = await setup();
    const me = await createTestUser('my-account@example.com');
    const sessionCookie = await createTestSession(me);
    await call(confirmInvitationAddress, { headers: { ...defaultHeaders, Cookie: [sessionCookie, invitationCookie].join('; ') } });

    const opened = await call(invokeToken, {
      path: { type: 'invitation', token: mailedLink('confirmUrl').token },
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });
    expect(opened.response.status).toBe(302);

    const { response } = await accept([sessionCookie, setCookiePair(opened.response, 'invitation')]);
    expect(response.status).toBe(200);
    expect((await membershipsOf(me.id)).map(({ organizationId }) => organizationId)).toEqual([organization.id]);
    const [address] = await db.select().from(emailsTable).where(eq(emailsTable.email, invitedEmail));
    expect(address?.userId).toBe(me.id);
  });

  it('lets the new member into the organization right after accepting', async () => {
    const { organization, invitationCookie } = await setup();
    const me = await createTestUser(invitedEmail);
    const sessionCookie = await createTestSession(me);
    const readMembers = () => readMembersAs(organization, sessionCookie);
    expect((await readMembers()).response.status).toBe(403);

    const { response } = await accept([sessionCookie, invitationCookie]);
    expect(response.status).toBe(200);

    expect((await readMembers()).response.status).toBe(200);
  });

  it('cannot be replayed once accepted', async () => {
    const { invitationCookie } = await setup();
    const me = await createTestUser(invitedEmail);
    const other = await createTestUser('other-account@example.com');

    const first = await accept([await createTestSession(me), invitationCookie]);
    expect(first.response.status).toBe(200);

    const replay = await accept([await createTestSession(other), invitationCookie]);
    expect(replay.response.status).toBe(401);
    expect(await membershipsOf(other.id)).toHaveLength(0);
  });

  it('refuses an invitation already bound to another user (GHSA-fmh4-wcc4-5jm3)', async () => {
    const owner = await createTestUser('owner@example.com');
    const organization = await createTestOrganization();
    // The row is bound to its owner while the token was never linked: possession of the link must not be enough.
    const { inactiveMembership, invitationCookie } = await createInvitation({
      token: 'invoked',
      email: invitedEmail,
      organization,
      createdBy: owner.id,
    });
    await db.update(inactiveMembershipsTable).set({ userId: owner.id }).where(eq(inactiveMembershipsTable.id, inactiveMembership.id));

    // Holding the invited address gets the attacker past the address check, to the row's own binding.
    const attacker = await createTestUser(invitedEmail);
    const { response } = await accept([await createTestSession(attacker), invitationCookie]);

    expect(response.status).toBe(404);
    expect(await membershipsOf(attacker.id)).toHaveLength(0);
    const [still] = await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id));
    expect(still.userId).toBe(owner.id);
  });

  it('refuses a token already linked to another user', async () => {
    const owner = await createTestUser('owner@example.com');
    const { invitationCookie } = await setup({ boundTo: owner.id });

    const attacker = await createTestUser('attacker@example.com');
    const { response } = await accept([await createTestSession(attacker), invitationCookie]);

    expect(response.status).toBe(409);
    expect(await membershipsOf(attacker.id)).toHaveLength(0);
  });

  it('accepts without a notice when the invitation is bound to the accepting user', async () => {
    const me = await createTestUser(invitedEmail);
    const { invitationCookie } = await setup({ boundTo: me.id });

    const { response } = await accept([await createTestSession(me), invitationCookie]);

    expect(response.status).toBe(200);
    expect(await membershipsOf(me.id)).toHaveLength(1);
    expect(mailer.sendEmails).not.toHaveBeenCalled();
  });

  it('requires the single-use invitation cookie', async () => {
    await setup();
    const me = await createTestUser('my-account@example.com');

    const { response } = await accept([await createTestSession(me)]);

    expect(response.status).toBe(401);
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

  it('lets exactly one of two racing sessions win', async () => {
    const { invitationCookie } = await setup();
    const me = await createTestUser(invitedEmail);
    const [firstSession, secondSession] = await Promise.all([createTestSession(me), createTestSession(me)]);

    const results = await Promise.all([accept([firstSession, invitationCookie]), accept([secondSession, invitationCookie])]);

    expect(results.filter((r) => r.response.status === 200)).toHaveLength(1);
    expect(await membershipsOf(me.id)).toHaveLength(1);
  });

  it('spends the invitation without a duplicate membership when the user is already a member', async () => {
    const organization = await createTestOrganization();
    const me = await createOrganizationAdminUser('my-account@example.com', organization.id, adminRole, organization.tenantId);
    const { inactiveMembership, invitationCookie } = await createInvitation({
      token: 'invoked',
      email: me.email,
      organization,
      createdBy: me.id,
    });

    const { response } = await accept([await createTestSession(me), invitationCookie]);

    expect(response.status).toBe(200);
    const memberships = await membershipsOf(me.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe(adminRole);
    expect(await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id))).toHaveLength(0);
  });
});

describe('Opening a token link while signed in', async () => {
  const call = await createAppClient();

  /** An unopened invitation link, for an organization of its own. */
  const freshInvitation = async (opts: { email: string; boundTo?: string | null }) => {
    const organization = await createTestOrganization();
    const inviter = await createTestUser('inviter@example.com');
    return createInvitation({ organization, createdBy: inviter.id, ...opts });
  };

  it('lets a signed-in user open an invitation that is not bound to anyone', async () => {
    const me = await createTestUser('my-account@example.com');
    const { rawToken: raw } = await freshInvitation({ email: invitedEmail });

    const { response } = await call(invokeToken, {
      path: { type: 'invitation', token: raw },
      headers: { ...defaultHeaders, Cookie: await createTestSession(me) },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain(`${appConfig.frontendUrl}/auth/authenticate?tokenId=`);
  });

  it('keeps an opened invitation usable long enough to sign in to another account', async () => {
    const { rawToken, token } = await freshInvitation({ email: invitedEmail });

    await call(invokeToken, { path: { type: 'invitation', token: rawToken }, headers: defaultHeaders });

    const [opened] = await db.select().from(tokensTable).where(eq(tokensTable.id, token.id));
    const minutesLeft = (new Date(opened.expiresAt).getTime() - Date.now()) / 60_000;
    // A magic link lives 15 minutes; the invitation must outlast that round trip.
    expect(minutesLeft).toBeGreaterThan(25);
    expect(minutesLeft).toBeLessThanOrEqual(30);
  });

  it('keeps the short window for other token types', async () => {
    const owner = await createTestUser('owner@example.com');
    const { raw, row: link } = await insertTestToken('magic', owner);

    // Opened in the browser that asked for it, so it is redeemed directly.
    await call(invokeToken, { path: { type: 'magic', token: raw }, headers: { ...defaultHeaders, Cookie: authCookie('magic-requested', link.id) } });

    const [opened] = await db.select().from(tokensTable).where(eq(tokensTable.email, owner.email));
    const minutesLeft = (new Date(opened.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeLessThanOrEqual(5);
  });

  it('still refuses an invitation linked to another user', async () => {
    const owner = await createTestUser('owner@example.com');
    const me = await createTestUser('my-account@example.com');
    const { rawToken: raw } = await freshInvitation({ email: owner.email, boundTo: owner.id });

    const { response } = await call(invokeToken, {
      path: { type: 'invitation', token: raw },
      headers: { ...defaultHeaders, Cookie: await createTestSession(me) },
    });

    expect(response.status).toBe(409);
  });

  it("still refuses another user's magic link", async () => {
    const owner = await createTestUser('owner@example.com');
    const me = await createTestUser('my-account@example.com');
    const { raw, row: link } = await insertTestToken('magic', owner);

    const cookies = [await createTestSession(me), authCookie('magic-requested', link.id)].join('; ');
    const { response } = await call(invokeToken, { path: { type: 'magic', token: raw }, headers: { ...defaultHeaders, Cookie: cookies } });

    expect(response.status).toBe(409);
  });
});
