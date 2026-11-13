import { signOut } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookieChange, createTestUser, expectRefusal, sessionRow } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';
import { insertSession, warmSession } from './session-helpers';

/** The sign-out write that fails next, as an exhausted pool would make it; null runs every write as usual. */
const nextFailure = vi.hoisted(() => ({ write: null as 'revoke' | null }));

/** Throws the pool's timeout once for `write` when it is the failure asked for. */
const failIfAsked = (write: 'revoke') => {
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
});
