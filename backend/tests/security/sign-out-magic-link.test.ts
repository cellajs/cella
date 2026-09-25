import { eq } from 'drizzle-orm';
import { invokeToken, signOut } from 'sdk';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { tokensTable } from '#/modules/auth/tokens-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { authCookie, createTestUser, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';
import { cookiesAfter } from './session-helpers';

setTestConfig({ enabledAuthStrategies: ['magic', 'passkey'] });

beforeAll(() => mockFetchRequest());

afterEach(async () => await clearSecurityTestData());

const sessionCookieSet = (res: Response) =>
  res.headers.getSetCookie().some((line) => line.startsWith(`${authCookieName('session')}=`) && !line.includes('=;'));

const magicCookieCleared = (res: Response) =>
  res.headers.getSetCookie().some((line) => line.startsWith(`${authCookieName('magic')}=;`));

const tokenRow = async (id: string) => (await db.select().from(tokensTable).where(eq(tokensTable.id, id)))[0];

/** An unopened magic link for `user`, and the marker cookie of the browser that asked for it. */
const requestedMagicLink = async (user: { id: string; email: string }) => {
  const raw = nanoid(40);
  const [row] = await db
    .insert(tokensTable)
    .values({
      secret: hashToken(raw),
      type: 'magic',
      userId: user.id,
      email: user.email,
      createdBy: user.id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    .returning();
  return { raw, row, requestedHere: authCookie('magic-requested', row.id) };
};

/**
 * An opened magic link lets the browser that holds its single-use cookie back in for the rest of its window, without
 * any other proof. On a shared computer that browser serves the next person too, so signing out spends the link.
 */
describe('Sign-out after a magic-link sign-in', async () => {
  const call = await createAppClient();

  const openLink = (raw: string, cookie: string) =>
    call(invokeToken, { path: { type: 'magic', token: raw }, headers: { ...defaultHeaders, Cookie: cookie } });

  it("must not sign the next person in as the owner via the owner's opened magic link after sign-out", async () => {
    const owner = await createTestUser(`shared-computer-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw, row, requestedHere } = await requestedMagicLink(owner);

    const opened = await openLink(raw, requestedHere);
    expect(opened.response.status).toBe(302);
    expect(sessionCookieSet(opened.response)).toBe(true);
    let ownerBrowser = cookiesAfter(requestedHere, opened.response);

    // Positive control: until the owner signs out, the browser holding the link's cookie gets back in with it.
    const reopenedBefore = await openLink(raw, ownerBrowser);
    expect(reopenedBefore.response.status).toBe(302);
    expect(sessionCookieSet(reopenedBefore.response)).toBe(true);
    ownerBrowser = cookiesAfter(ownerBrowser, reopenedBefore.response);

    const signedOut = await call(signOut, { headers: { ...defaultHeaders, Cookie: ownerBrowser } });
    expect(signedOut.response.status).toBe(204);
    expect(magicCookieCleared(signedOut.response)).toBe(true);
    expect(await tokenRow(row.id)).toBeUndefined();

    // The next person reopens the link from the history, even with the single-use cookie as it was before sign-out.
    const withoutSession = ownerBrowser
      .split('; ')
      .filter((pair) => !pair.startsWith(`${authCookieName('session')}=`))
      .join('; ');
    const reopened = await openLink(raw, withoutSession);
    expect(reopened.response.status).toBe(401);
    expect((reopened.error as ErrorResponse).type).toBe('magic_not_found');
    expect(sessionCookieSet(reopened.response)).toBe(false);
  });

  it('must not leave the opened magic link usable via a sign-out whose session already ended', async () => {
    const owner = await createTestUser(`ended-session-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw, row, requestedHere } = await requestedMagicLink(owner);

    const opened = await openLink(raw, requestedHere);
    const ownerBrowser = cookiesAfter(requestedHere, opened.response);
    // The session ends elsewhere first, so this sign-out has no session left to end.
    const session = ownerBrowser.split('; ').find((pair) => pair.startsWith(`${authCookieName('session')}=`));
    expect(session).toBeDefined();
    await call(signOut, { headers: { ...defaultHeaders, Cookie: session! } });

    const signedOut = await call(signOut, { headers: { ...defaultHeaders, Cookie: ownerBrowser } });
    expect(signedOut.response.status).toBe(401);
    expect(magicCookieCleared(signedOut.response)).toBe(true);
    expect(await tokenRow(row.id)).toBeUndefined();

    const reopened = await openLink(raw, ownerBrowser);
    expect(reopened.response.status).toBe(401);
    expect(sessionCookieSet(reopened.response)).toBe(false);
  });

  it("spends only this browser's link: another browser's opened link keeps working (positive control)", async () => {
    const [owner, other] = [
      await createTestUser(`owner-${nanoid(6)}@security-test.com`.toLowerCase()),
      await createTestUser(`other-${nanoid(6)}@security-test.com`.toLowerCase()),
    ];
    const ownerLink = await requestedMagicLink(owner);
    const otherLink = await requestedMagicLink(other);

    const ownerBrowser = cookiesAfter(
      ownerLink.requestedHere,
      (await openLink(ownerLink.raw, ownerLink.requestedHere)).response,
    );
    const otherBrowser = cookiesAfter(
      otherLink.requestedHere,
      (await openLink(otherLink.raw, otherLink.requestedHere)).response,
    );

    expect((await call(signOut, { headers: { ...defaultHeaders, Cookie: ownerBrowser } })).response.status).toBe(204);

    expect(await tokenRow(otherLink.row.id)).toBeDefined();
    const reopened = await openLink(otherLink.raw, otherBrowser);
    expect(reopened.response.status).toBe(302);
    expect(reopened.response.headers.get('location')?.startsWith(appConfig.frontendUrl)).toBe(true);
  });
});
