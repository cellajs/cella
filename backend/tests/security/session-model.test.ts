import { getMe } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { authCookie, cookieChange, createTestUser, sessionRow } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';
import { expectSignedOut, insertSession, warmSession } from './session-helpers';

afterEach(async () => {
  vi.restoreAllMocks();
  await clearSecurityTestData();
});

/**
 * Fails the query that reads a session by its token's hash, as a database outage would: the first `skip` such lookups
 * pass, the next one throws.
 */
const failSessionLookup = ({ skip = 0 } = {}) => {
  const select = db.select.bind(db);
  let seen = 0;
  // One implementation stands in for every overload of `select`, which no single function signature matches.
  return vi.spyOn(db, 'select').mockImplementation(((fields?: Record<string, unknown>) => {
    if (fields && 'revokedAt' in fields && 'systemRole' in fields && seen++ === skip) {
      throw new Error('Connection terminated unexpectedly');
    }
    return select(fields as never);
  }) as unknown as typeof db.select);
};

/**
 * A session is its cookie's random token: the database keeps only the token's hash and the auth cache is keyed by that
 * hash. Signing a cookie (a leaked `COOKIE_SECRET`) or reading a sessions row therefore never yields a session, and a
 * cached entry answers only to the token itself, and only until the session expires.
 */
describe('session model', async () => {
  const call = await createAppClient();

  const me = (cookie: string) => call(getMe, { headers: { ...defaultHeaders, Cookie: cookie } });

  it('must not authenticate a forged secret via a cached session id', async () => {
    const user = await createTestUser('cached@security-test.com');
    const session = await insertSession(user);
    await warmSession(session);

    // The attacker signs cookies and knows the session id, not the session's token.
    await expectSignedOut(authCookie('session', `${hashToken(nanoid(40))}.${session.id}.`), 'no_session');
    await expectSignedOut(authCookie('session', nanoid(40)), 'no_session');

    await warmSession(session);
  });

  it("must not authenticate via a sessions row's stored hash replayed as a cookie", async () => {
    const user = await createTestUser('stored-hash@security-test.com');
    const session = await insertSession(user);
    const { secret, id } = await sessionRow(session.id);

    await expectSignedOut(authCookie('session', `${secret}.${id}.`), 'no_session');
    await expectSignedOut(authCookie('session', secret), 'no_session');

    await warmSession(session);
  });

  it('must not authenticate an expired session via a warm cache', async () => {
    const user = await createTestUser('expiring@security-test.com');
    const expiring = await insertSession(user, { expiresInMs: 1500 });
    const live = await insertSession(user);
    await warmSession(expiring);
    await warmSession(live);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    await expectSignedOut(expiring.cookie, 'session_expired');
    await warmSession(live);
  });

  it('must not sign a user out for good via a failed session lookup', async () => {
    const user = await createTestUser('outage@security-test.com');
    const session = await insertSession(user);

    // The cookie holds the only copy of the token: a lookup that fails must leave it in place.
    const lookup = failSessionLookup();
    const { response } = await me(session.cookie);
    lookup.mockRestore();
    expect(response.status).toBe(500);
    expect(cookieChange(response, 'session')).toBeUndefined();

    // Once the database answers again, the same cookie signs in (positive control).
    expect((await me(session.cookie)).response.status).toBe(200);
  });
});
