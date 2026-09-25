import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getMe } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName, sealAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { defaultHeaders } from '../fixtures';
import { authCookie, createTestSession, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';

/** A live session's cookie content, `<secret hash>.<session id>.`, read from its row so no cookie format is assumed. */
const sessionContentFor = async (user: { id: string }) => {
  await createTestSession(user);
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.userId, user.id));
  return `${row.secret}.${row.id}.`;
};

/**
 * Every mode signs its cookies, and the signature covers the cookie's name and expiry. A cookie the server did not
 * sign, a value signed for another cookie, and a value past its max age all read as no cookie at all.
 */
describe('cookie integrity', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  const meWith = (cookie: string) => call(getMe, { headers: { ...defaultHeaders, Cookie: cookie } });

  it('must not authenticate an unsigned session cookie', async () => {
    const user = await createTestUser(`cookie-${nanoid(6)}@security-test.com`.toLowerCase());
    const content = await sessionContentFor(user);

    const { response } = await meWith(`${authCookieName('session')}=${content}`);
    expect(response.status).toBe(401);
  });

  it('must not authenticate a value signed for another cookie', async () => {
    const user = await createTestUser(`cookie-${nanoid(6)}@security-test.com`.toLowerCase());
    const content = await sessionContentFor(user);

    // What a public endpoint hands out, e.g. a passkey challenge, carries a valid signature for its own name only.
    const transplanted = sealAuthCookie('passkey-challenge', content, 60 * 60);
    const { response } = await meWith(`${authCookieName('session')}=${encodeURIComponent(transplanted)}`);
    expect(response.status).toBe(401);
  });

  it('reads back a cookie sealed with a max age in fractions of a second (positive control)', async () => {
    const user = await createTestUser(`cookie-${nanoid(6)}@security-test.com`.toLowerCase());
    const content = await sessionContentFor(user);

    // A lifetime taken from a stored expiry (as when stopping an impersonation) is measured in milliseconds.
    const { response } = await meWith(authCookie('session', content, 3599.5));
    expect(response.status).toBe(200);
  });

  it('must not authenticate a session cookie past its max age', async () => {
    const user = await createTestUser(`cookie-${nanoid(6)}@security-test.com`.toLowerCase());
    const content = await sessionContentFor(user);

    const { response } = await meWith(authCookie('session', content, -60));
    expect(response.status).toBe(401);
  });

  it('must not authenticate a value signed with a secret the app does not hold', async () => {
    const user = await createTestUser(`cookie-${nanoid(6)}@security-test.com`.toLowerCase());
    const content = await sessionContentFor(user);

    const name = `${appConfig.slug}-session-${appConfig.cookieVersion}`;
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const mac = createHmac('sha256', 'an-attacker-secret')
      .update(`${name}\n${expiresAt}\n${content}`)
      .digest('base64url');
    const { response } = await meWith(
      `${authCookieName('session')}=${encodeURIComponent(`${content}.${expiresAt}.${mac}`)}`,
    );
    expect(response.status).toBe(401);
  });

  it('authenticates a session cookie the app signed (positive control)', async () => {
    const user = await createTestUser(`cookie-${nanoid(6)}@security-test.com`.toLowerCase());
    const { response } = await meWith(await createTestSession(user));
    expect(response.status).toBe(200);
  });
});
