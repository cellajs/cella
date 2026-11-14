import { and, eq } from 'drizzle-orm';
import { invokeToken, sendMagicLink } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { buildNotificationPath } from 'shared/utils/notification-link';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { tokensTable } from '#/modules/auth/tokens/tokens-db';
import { invitationsTable } from '#/modules/memberships/invitations-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import { authCookie, cookieChange, createTestOrganization, createTestUser, enableMFAForUser, insertTestToken } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';
import { createInvitation } from './helpers';

const invitedEmail = 'colleague@example.com';

setTestConfig({ enabledAuthStrategies: ['passkey', 'magic'], selfRegistration: true });

afterEach(async () => await clearDatabase());

/**
 * Following the invitation mail and signing in through the link it offers answers the invitation. Only the browser that
 * opened the invitation's own link, signing in to the invited address, skips the explicit step.
 */
describe('Accept the followed invitation at the magic-link sign-in', async () => {
  const call = await createAppClient();

  const setup = async () => {
    const organization = await createTestOrganization();
    const inviter = await createTestUser('inviter@example.com');
    return { organization, inviter };
  };

  /** Opens a magic link for `owner` in the browser that asked for it, which also holds `cookies`; returns the account. */
  const openMagicLink = async (owner: { id?: string | null; email: string }, cookies: string[] = []) => {
    const { raw, row } = await insertTestToken('magic', owner);
    const { response } = await call(invokeToken, {
      path: { kind: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: [authCookie('magic-requested', row.id), ...cookies].join('; ') },
    });
    expect(response.status).toBe(302);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, owner.email));
    return { response, user };
  };

  const membershipsOf = (userId: string) => db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
  const invitationRow = async (id: string) => (await db.select().from(invitationsTable).where(eq(invitationsTable.id, id)))[0];

  it.each([{ account: 'new' }, { account: 'existing' }])(
    'accepts the invitation this browser opened, signing in to a $account account',
    async ({ account }) => {
      const { organization, inviter } = await setup();
      const existing = account === 'existing' ? await createTestUser(invitedEmail) : null;
      const { inactiveMembership, invitationCookie } = await createInvitation({
        organization,
        email: invitedEmail,
        createdBy: inviter.id,
        token: 'invoked',
      });

      const { response, user } = await openMagicLink(existing ?? { email: invitedEmail }, [invitationCookie]);
      expect(cookieChange(response, 'session')).toBe('set');
      // The sign-in lands on the joined organization, through the link the frontend resolves to its route
      const location = new URL(response.headers.get('location') ?? '');
      expect(`${location.pathname}${location.search}`).toBe(
        buildNotificationPath({
          tenantId: organization.tenantId,
          organizationId: organization.id,
          channelId: organization.id,
          channelType: 'organization',
        }),
      );

      expect((await membershipsOf(user.id)).map(({ organizationId }) => organizationId)).toEqual([organization.id]);
      expect(await invitationRow(inactiveMembership.id)).toBeUndefined();
    },
  );

  it('accepts on another device the invitation the browser that asked for the link opened', async () => {
    const { organization, inviter } = await setup();
    const { inactiveMembership } = await createInvitation({ organization, email: invitedEmail, createdBy: inviter.id });
    const { raw, row } = await insertTestToken('magic', { email: invitedEmail }, { followedInvitationId: inactiveMembership.id });

    // The browser that opens the link holds no invitation cookie, only its own request marker.
    const { response } = await call(invokeToken, {
      path: { kind: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: authCookie('magic-requested', row.id) },
    });
    expect(response.status).toBe(302);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, invitedEmail));
    expect((await membershipsOf(user.id)).map(({ organizationId }) => organizationId)).toEqual([organization.id]);
    expect(await invitationRow(inactiveMembership.id)).toBeUndefined();
  });

  it.each([
    { opened: 'to the asked address', email: invitedEmail, recorded: true },
    { opened: 'to another address', email: 'someone-else@example.com', recorded: false },
  ])('records on the sign-in link only an opened invitation $opened', async ({ email, recorded }) => {
    const { organization, inviter } = await setup();
    const opened = await createInvitation({ organization, email, createdBy: inviter.id, token: 'invoked' });

    await call(sendMagicLink, { body: { email: invitedEmail }, headers: { ...defaultHeaders, Cookie: opened.invitationCookie } });

    // The link is issued after the answer.
    const link = await vi.waitFor(async () => {
      const [row] = await db
        .select()
        .from(tokensTable)
        .where(and(eq(tokensTable.kind, 'magic'), eq(tokensTable.email, invitedEmail)));
      expect(row).toBeDefined();
      return row;
    });
    expect(link.followedInvitationId).toBe(recorded ? opened.inactiveMembership.id : null);
  });

  it('must not accept an invitation the sign-in claims by its address alone', async () => {
    const { organization, inviter } = await setup();
    const { inactiveMembership } = await createInvitation({ organization, email: invitedEmail, createdBy: inviter.id });

    const { user } = await openMagicLink({ email: invitedEmail });

    expect(await membershipsOf(user.id)).toEqual([]);
    expect(await invitationRow(inactiveMembership.id)).toMatchObject({ userId: user.id, declinedAt: null });
  });

  it.each([
    { cookie: 'of an opened invitation to another address', other: true },
    { cookie: 'signed by the app but naming no token', other: false },
  ])('must not accept an unopened invitation through an invitation cookie $cookie', async ({ other }) => {
    const { organization, inviter } = await setup();
    const { inactiveMembership } = await createInvitation({ organization, email: invitedEmail, createdBy: inviter.id });
    const opened = other
      ? await createInvitation({ organization, email: 'someone-else@example.com', createdBy: inviter.id, token: 'invoked' })
      : null;

    const { user } = await openMagicLink({ email: invitedEmail }, [opened?.invitationCookie ?? authCookie('invitation', nanoid(40))]);

    expect(await membershipsOf(user.id)).toEqual([]);
    expect(await invitationRow(inactiveMembership.id)).toMatchObject({ userId: user.id, declinedAt: null });
    if (opened) expect(await invitationRow(opened.inactiveMembership.id)).toMatchObject({ userId: null, declinedAt: null });
  });

  it('must not accept the invitation before the second factor of an account with MFA', async () => {
    const { organization, inviter } = await setup();
    const existing = await createTestUser(invitedEmail);
    await enableMFAForUser(existing.id);
    const { inactiveMembership, invitationCookie } = await createInvitation({
      organization,
      email: invitedEmail,
      createdBy: inviter.id,
      token: 'invoked',
    });

    const { response, user } = await openMagicLink(existing, [invitationCookie]);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/mfa');

    expect(await membershipsOf(user.id)).toEqual([]);
    expect(await invitationRow(inactiveMembership.id)).toMatchObject({ userId: user.id, declinedAt: null });
  });
});
