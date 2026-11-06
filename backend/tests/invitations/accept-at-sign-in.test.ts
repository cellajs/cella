import { eq } from 'drizzle-orm';
import { invokeToken } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
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
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: [authCookie('magic-requested', row.id), ...cookies].join('; ') },
    });
    expect(response.status).toBe(302);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, owner.email));
    return { response, user };
  };

  const membershipsOf = (userId: string) => db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
  const invitationRow = async (id: string) => (await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, id)))[0];

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

      expect((await membershipsOf(user.id)).map(({ organizationId }) => organizationId)).toEqual([organization.id]);
      expect(await invitationRow(inactiveMembership.id)).toBeUndefined();
    },
  );

  it('must not accept an invitation the sign-in claims by its address alone', async () => {
    const { organization, inviter } = await setup();
    const { inactiveMembership } = await createInvitation({ organization, email: invitedEmail, createdBy: inviter.id });

    const { user } = await openMagicLink({ email: invitedEmail });

    expect(await membershipsOf(user.id)).toEqual([]);
    expect(await invitationRow(inactiveMembership.id)).toMatchObject({ userId: user.id, rejectedAt: null });
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
    expect(await invitationRow(inactiveMembership.id)).toMatchObject({ userId: user.id, rejectedAt: null });
    if (opened) expect(await invitationRow(opened.inactiveMembership.id)).toMatchObject({ userId: null, rejectedAt: null });
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
    expect(await invitationRow(inactiveMembership.id)).toMatchObject({ userId: user.id, rejectedAt: null });
  });
});
