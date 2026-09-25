import { and, eq } from 'drizzle-orm';
import { getMe, startImpersonation, stopImpersonation } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { authCookie, createSystemAdminUser, createTestUser, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest } from '../test-utils';
import { clearSecurityTestData } from './helpers';
import { cookiesAfter, insertSession, sessionRow, type TestSession } from './session-helpers';

beforeAll(() => mockFetchRequest());

afterEach(async () => await clearSecurityTestData());

/**
 * A session is its cookie's random token: the database keeps only the token's hash and the auth cache is keyed by that
 * hash. Signing a cookie (a leaked `COOKIE_SECRET`) or reading a sessions row therefore never yields a session, and a
 * cached entry answers only to the token itself, and only until the session expires.
 */
describe('session model', async () => {
  const call = await createAppClient();

  const me = (cookie: string) => call(getMe, { headers: { ...defaultHeaders, Cookie: cookie } });

  /** Warms the auth cache for a session: the next request hits the cached entry, not the database. */
  const warm = async (session: TestSession) => expect((await me(session.cookie)).response.status).toBe(200);

  const expectRefused = async (cookie: string, type: string) => {
    const { error, response } = await me(cookie);
    expect(response.status).toBe(401);
    expect((error as ErrorResponse).type).toBe(type);
  };

  it('must not authenticate a forged secret via a cached session id', async () => {
    const user = await createTestUser('cached@security-test.com');
    const session = await insertSession(user);
    await warm(session);

    // The attacker signs cookies and knows the session id, not the session's token.
    await expectRefused(authCookie('session', `${hashToken(nanoid(40))}.${session.id}.`), 'no_session');
    await expectRefused(authCookie('session', nanoid(40)), 'no_session');

    await warm(session);
  });

  it("must not authenticate via a sessions row's stored hash replayed as a cookie", async () => {
    const user = await createTestUser('stored-hash@security-test.com');
    const session = await insertSession(user);
    const { secret, id } = await sessionRow(session.id);

    await expectRefused(authCookie('session', `${secret}.${id}.`), 'no_session');
    await expectRefused(authCookie('session', secret), 'no_session');

    await warm(session);
  });

  it('must not authenticate an expired session via a warm cache', async () => {
    const user = await createTestUser('expiring@security-test.com');
    const expiring = await insertSession(user, { expiresInMs: 1500 });
    const live = await insertSession(user);
    await warm(expiring);
    await warm(live);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    await expectRefused(expiring.cookie, 'session_expired');
    await warm(live);
  });

  it("must not hand out another admin's session via a forged adminUserId at stop-impersonation", async () => {
    const victimAdmin = await createSystemAdminUser('victim-admin@security-test.com');
    const victimSession = await insertSession(victimAdmin);
    const admin = await createSystemAdminUser('impersonating-admin@security-test.com');
    const adminSession = await insertSession(admin);
    const target = await createTestUser('impersonated@security-test.com');

    const started = await call(startImpersonation, {
      body: { targetUserId: target.id },
      headers: adminSession.headers,
    });
    expect(started.response.status).toBe(204);
    const [impersonation] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.userId, target.id), eq(sessionsTable.type, 'impersonation')));

    // A cookie signed with the app's secret, naming the victim as the admin to return to.
    const forged = authCookie('session', `${impersonation.secret}.${impersonation.id}.${victimAdmin.id}`);
    const stopped = await call(stopImpersonation, { headers: { ...defaultHeaders, Cookie: forged } });
    expect(stopped.response.status).toBe(401);

    // Nothing the response set signs anyone in as the victim admin.
    const handedOut = await me(cookiesAfter(forged, stopped.response));
    expect(handedOut.response.status).toBe(401);
    expect((await sessionRow(victimSession.id)).revokedAt).toBeNull();

    // The impersonating admin stops with the cookies the start set, and is back on their own session.
    const browser = cookiesAfter(adminSession.cookie, started.response);
    expect(((await me(browser)).data as { user: { id: string } }).user.id).toBe(target.id);
    const genuine = await call(stopImpersonation, { headers: { ...defaultHeaders, Cookie: browser } });
    expect(genuine.response.status).toBe(204);
    expect(await sessionRow(impersonation.id)).toMatchObject({
      revocationReason: 'impersonation_stopped',
      revokedBy: admin.id,
    });
    const back = await me(cookiesAfter(browser, genuine.response));
    expect((back.data as { user: { id: string } }).user.id).toBe(admin.id);
    await warm(victimSession);
  });
});
