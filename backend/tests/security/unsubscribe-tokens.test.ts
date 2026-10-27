import { eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb } from '#/db/db';
import { buildUnsubscribeLink, type UnsubscribeCategory } from '#/modules/notification/helpers/category-token';
import { notificationPreferencesTable } from '#/modules/notification/notification-db';
import { findOrCreatePreferences } from '#/modules/notification/notification-queries';
import { createAccount } from '#/modules/user/operations/create-account';
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
  const user = await createAccount({ var: { db: baseDb } }, { newUser: mockUser({ email: `${label}@example.test` }), via: 'magic' });
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

/** Opens an unsubscribe link the way a reader, a mail scanner or a link preview does; answers the redirect target. */
const openLink = async (link: string) => {
  const { baseApp } = await import('#/routes');
  const response = await baseApp.request(link.replace(appConfig.backendUrl, ''), { headers: defaultHeaders });
  return { status: response.status, location: new URL(response.headers.get('location') ?? '', appConfig.frontendUrl) };
};

/**
 * Posts an unsubscribe link the way a mail client's one-click unsubscribe does (RFC 8058): a form post with no Origin and
 * no session. `resubscribe` posts the same link's undo as the confirmation page does, from the app's origin.
 */
const postLink = async (link: string, action: 'unsubscribe' | 'resubscribe' = 'unsubscribe') => {
  const { baseApp } = await import('#/routes');
  const target = link.replace(appConfig.backendUrl, '').replace('/notifications/unsubscribe', `/notifications/${action}`);
  const oneClick = { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': defaultHeaders['x-forwarded-for'] };
  const init = action === 'unsubscribe' ? { headers: oneClick, body: 'List-Unsubscribe=One-Click' } : { headers: defaultHeaders };
  const response = await baseApp.request(target, { method: 'POST', ...init });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
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
      const { status, body } = await postLink(target);
      expect(status, target).toBe(401);
      expect(body, target).toMatchObject({ type: 'unsubscribe_failed' });
    }
    expect([await emailSettings(owner.id), await emailSettings(other.id)]).toEqual(before);
  });

  it('changes nothing when a link is only opened, turns off only its category when posted, and turns it back on', async () => {
    const everythingOn = { newsletter: true, digest: 'weekly', mentionEmail: true };
    // The newsletter link leaves the digest on; the digest link leaves the newsletter on.
    for (const [category, expected] of [
      ['newsletter', { ...everythingOn, newsletter: false }],
      ['digest', { ...everythingOn, digest: 'off' }],
    ] as const) {
      const owner = await signUp(`${category}-reader`);
      await findOrCreatePreferences({ var: { db: baseDb } }, { userId: owner.id });
      const link = buildUnsubscribeLink(owner.id, category);

      // Mail scanners and link previews open links on their own: opening leads to the confirmation page only.
      const opened = await openLink(link);
      expect(opened.status, category).toBe(302);
      expect(opened.location.pathname, category).toBe('/auth/unsubscribe');
      expect(opened.location.searchParams.get('category'), category).toBe(category);
      expect(await emailSettings(owner.id), category).toEqual(everythingOn);

      expect((await postLink(link)).status, category).toBe(204);
      expect(await emailSettings(owner.id), category).toEqual(expected);

      expect((await postLink(link, 'resubscribe')).status, category).toBe(204);
      expect(await emailSettings(owner.id), category).toEqual(everythingOn);
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
    expect((await postLink(mailedLink('unsubscribeLink').url)).status).toBe(204);
    expect(await emailSettings(reader.id)).toEqual({ newsletter: false });
  });
});
