import { invokeToken, signOut } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultHeaders } from '../fixtures';
import { authCookie, cookieChange, cookiesAfter, createTestUser, expectRefusal, insertTestToken, sessionRow, tokenRow } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';
import { insertSession, sessionSetBy, warmSession } from './session-helpers';

/** The sign-out write that fails next, as an exhausted pool would make it; null runs every write as usual. */
const nextFailure = vi.hoisted(() => ({ write: null as 'revoke' | 'spend' | null }));

/** Throws the pool's timeout once for `write` when it is the failure asked for. */
const failIfAsked = (write: 'revoke' | 'spend') => {
  if (nextFailure.write !== write) return;
  nextFailure.write = null;
  throw new Error('timeout exceeded when trying to connect');
};

vi.mock('#/modules/auth/sessions/operations/revoke-sessions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/auth/sessions/operations/revoke-sessions')>();
  return {
    ...actual,
    revokeSessions: async (...args: Parameters<typeof actual.revokeSessions>) => {
      failIfAsked('revoke');
      return actual.revokeSessions(...args);
    },
  };
});

vi.mock('#/modules/auth/tokens/tokens-queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/auth/tokens/tokens-queries')>();
  return {
    ...actual,
    deleteBoundToken: async (...args: Parameters<typeof actual.deleteBoundToken>) => {
      failIfAsked('spend');
      return actual.deleteBoundToken(...args);
    },
  };
});

setTestConfig({ enabledAuthStrategies: ['magic', 'passkey'] });

afterEach(async () => {
  nextFailure.write = null;
  await clearSecurityTestData();
});

/**
 * A sign-out that fails must not read as one: a cookie deleted while its session still works leaves the row live for
 * anyone who copied the cookie, and the browser no way to end it. Every write runs first, so a failure keeps every
 * cookie and a retry signs out.
 */
describe('A sign-out that fails', async () => {
  const call = await createAppClient();

  it('must not delete the session cookie when the revoke fails', async () => {
    const user = await createTestUser(`revoke-fails-${nanoid(6)}@security-test.com`.toLowerCase());
    const session = await insertSession(user);
    await warmSession(session);

    nextFailure.write = 'revoke';
    const failed = await call(signOut, { headers: session.headers });
    await expectRefusal(failed, 503, 'service_unavailable');
    expect(cookieChange(failed.response, 'session')).toBeUndefined();
    expect((await sessionRow(session.id)).revokedAt).toBeNull();

    // Positive control: the browser kept its cookie, so the retry ends the session.
    const retried = await call(signOut, { headers: session.headers });
    expect(retried.response.status).toBe(204);
    expect(cookieChange(retried.response, 'session')).toBe('cleared');
    expect(await sessionRow(session.id)).toMatchObject({ revocationReason: 'sign_out' });
  });

  it('must not delete the session or magic-link cookie when the magic-link spend fails', async () => {
    const user = await createTestUser(`spend-fails-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw, row } = await insertTestToken('magic', user);
    const requestedHere = authCookie('magic-requested', row.id);
    const opened = await call(invokeToken, { path: { type: 'magic', token: raw }, headers: { ...defaultHeaders, Cookie: requestedHere } });
    expect(opened.response.status).toBe(302);
    const browser = cookiesAfter(requestedHere, opened.response);
    const session = await sessionSetBy(opened.response);

    nextFailure.write = 'spend';
    const failed = await call(signOut, { headers: { ...defaultHeaders, Cookie: browser } });
    await expectRefusal(failed, 503, 'service_unavailable');
    expect(cookieChange(failed.response, 'session')).toBeUndefined();
    expect(cookieChange(failed.response, 'magic')).toBeUndefined();
    expect((await sessionRow(session.id)).revokedAt).toBeNull();
    expect(await tokenRow(row.id)).toBeDefined();

    // Positive control: the retry spends the link, ends the session and clears both cookies.
    const retried = await call(signOut, { headers: { ...defaultHeaders, Cookie: browser } });
    expect(retried.response.status).toBe(204);
    expect(cookieChange(retried.response, 'session')).toBe('cleared');
    expect(cookieChange(retried.response, 'magic')).toBe('cleared');
    expect(await sessionRow(session.id)).toMatchObject({ revocationReason: 'sign_out' });
    expect(await tokenRow(row.id)).toBeUndefined();
  });
});
