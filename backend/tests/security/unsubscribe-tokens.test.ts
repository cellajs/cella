import { eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb } from '#/db/db';
import { handleCreateUser } from '#/modules/auth/general/helpers/user';
import { buildUnsubscribeLink, type UnsubscribeCategory } from '#/modules/notification/helpers/category-token';
import { notificationPreferencesTable } from '#/modules/notification/notification-db';
import { findOrCreatePreferences } from '#/modules/notification/notification-queries';
import { usersTable } from '#/modules/user/user-db';
import { mockUser } from '#/modules/user/user-mocks';
import { defaultHeaders, memberRole } from '../fixtures';
import {
  adminDb,
  createOrganizationAdminUser,
  createSystemAdminUser,
  createTestOrganization,
  createTestSession,
  mailedLink,
  sentMails,
} from '../helpers';
import { clearSecurityTestData } from './helpers';

/** A user created the way sign-up creates one, subscribed to the newsletter. */
const signUp = async (label: string) => {
  const user = await handleCreateUser({ var: { db: baseDb } }, { newUser: mockUser({ email: `${label}@example.test` }), via: 'magic' });
  await adminDb.update(usersTable).set({ newsletter: true }).where(eq(usersTable.id, user.id));
  return user;
};

/** Everything an unsubscribe link may switch, read past RLS: the newsletter flag on the user and the email preferences. */
const emailSettings = async (userId: string) => {
  const [user] = await adminDb.select({ newsletter: usersTable.newsletter }).from(usersTable).where(eq(usersTable.id, userId));
  const [preferences] = await adminDb
    .select({ digest: notificationPreferencesTable.digest, mentionEmail: notificationPreferencesTable.mentionEmail })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId));
  return { ...user, ...preferences };
};

/** Opens an unsubscribe link the way a mail client does; answers the redirect target. */
const openLink = async (link: string) => {
  const { baseApp } = await import('#/routes');
  const response = await baseApp.request(link.replace(appConfig.backendUrl, ''), { headers: defaultHeaders });
  return { status: response.status, location: new URL(response.headers.get('location') ?? '', appConfig.frontendUrl) };
};

const tokenOf = (userId: string, category: UnsubscribeCategory) => new URL(buildUnsubscribeLink(userId, category)).searchParams.get('token') ?? '';

const linkFor = (userId: string, category: UnsubscribeCategory, token: string) =>
  `/notifications/unsubscribe?user=${userId}&category=${category}&token=${token}`;

/**
 * An unsubscribe link turns off one email category for one user without a session. Its token is an HMAC over both
 * under a server secret, so the database stores nothing a reader could open, the link keeps working however old it is,
 * and a link made for one user or one category opens nothing else.
 */
describe('Unsubscribe links', () => {
  afterEach(async () => await clearSecurityTestData());

  it("must not turn off another user's or another category's email via a link made for one", async () => {
    const [owner, other] = [await signUp('link-owner'), await signUp('link-other')];
    const before = [await emailSettings(owner.id), await emailSettings(other.id)];
    const digestToken = tokenOf(owner.id, 'digest');

    for (const target of [
      linkFor(other.id, 'digest', digestToken),
      linkFor(owner.id, 'mention', digestToken),
      linkFor(owner.id, 'newsletter', digestToken),
      linkFor(owner.id, 'digest', tokenOf(owner.id, 'newsletter')),
      linkFor(owner.id, 'digest', digestToken.slice(0, -1)),
    ]) {
      const { status, location } = await openLink(target);
      expect(status, target).toBe(302);
      expect(location.pathname, target).toBe('/auth/error');
      expect(location.searchParams.get('error'), target).toBe('unsubscribe_failed');
    }
    expect([await emailSettings(owner.id), await emailSettings(other.id)]).toEqual(before);
  });

  it('turns off only the category its link names (positive control)', async () => {
    const everythingOn = { newsletter: true, digest: 'weekly', mentionEmail: true };
    // The newsletter link leaves the digest on; the digest link leaves the newsletter on.
    for (const [category, expected] of [
      ['newsletter', { ...everythingOn, newsletter: false }],
      ['digest', { ...everythingOn, digest: 'off' }],
    ] as const) {
      const owner = await signUp(`${category}-reader`);
      await findOrCreatePreferences({ var: { db: baseDb } }, owner.id);

      const { status, location } = await openLink(buildUnsubscribeLink(owner.id, category));

      expect(status, category).toBe(302);
      expect(location.pathname, category).toBe('/auth/unsubscribed');
      expect(await emailSettings(owner.id), category).toEqual(expected);
    }
  });

  it('must not skip a member who signed up long ago, and must not mail one who unsubscribed', async () => {
    const organization = await createTestOrganization();
    const member = async (label: string, newsletter: boolean) => {
      const user = await createOrganizationAdminUser(`${label}@example.test`, organization.id, memberRole, organization.tenantId);
      await adminDb.update(usersTable).set({ newsletter }).where(eq(usersTable.id, user.id));
      return user;
    };
    const reader = await member('newsletter-reader', true);
    await member('newsletter-left', false);
    const admin = await createSystemAdminUser('newsletter-sender@example.test');
    const { baseApp } = await import('#/routes');

    const response = await baseApp.request('/system/newsletter?toSelf=false', {
      method: 'POST',
      headers: { ...defaultHeaders, Cookie: await createTestSession(admin) },
      body: JSON.stringify({ organizationIds: [organization.id], roles: [memberRole], subject: 'News', content: '<p>News</p>' }),
    });
    expect(response.status).toBe(204);

    // The reader, who holds no row anywhere, is mailed; the member who unsubscribed is not.
    expect(sentMails().map(({ recipient }) => recipient.email)).toEqual([reader.email]);

    // Positive control: the link in the mail turns the reader's newsletter off.
    const { status, location } = await openLink(mailedLink('unsubscribeLink').url);
    expect(status).toBe(302);
    expect(location.pathname).toBe('/auth/unsubscribed');
    expect(await emailSettings(reader.id)).toEqual({ newsletter: false });
  });
});
