import { decodeBase32 } from '@oslojs/encoding';
import { getMe, signInWithTotp, signOut } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { defaultHeaders } from '../fixtures';
import {
  authCookie,
  createMfaToken,
  createTestSession,
  createTotpUser,
  expectRefusal,
  sessionsOf,
  tokenRowOf,
} from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

/** The Base32 secret `createTotpUser` stores. */
const totpSecret = 'JBSWY3DPEHPK3PXP';
const currentCode = () =>
  generateTOTP(decodeBase32(totpSecret), appConfig.totp.intervalInSeconds, appConfig.totp.digits);

beforeAll(() => {
  mockFetchRequest();
});

afterEach(async () => await clearSecurityTestData());

/** A browser that is signed in and also holds a second-factor challenge, from a sign-in it started and left. */
describe('Sign-out with a pending MFA challenge', async () => {
  const call = await createAppClient();

  it('must not keep the session alive via a sign-out that carries an MFA challenge', async () => {
    const user = await createTotpUser('owner@security-test.com');
    const sessionCookie = await createTestSession(user);
    const otherSessionCookie = await createTestSession(user);
    const mfaToken = await createMfaToken(user);
    const mfaCookie = authCookie('confirm-mfa', mfaToken);
    const sessionHeaders = { ...defaultHeaders, Cookie: sessionCookie };

    // Cache the session first, so the refusal below also proves the cache entry was dropped.
    expect((await call(getMe, { headers: sessionHeaders })).response.status).toBe(200);

    const { response } = await call(signOut, {
      headers: { ...defaultHeaders, Cookie: `${sessionCookie}; ${mfaCookie}` },
    });
    expect(response.status).toBe(204);

    const afterwards = await call(getMe, { headers: sessionHeaders });
    await expectRefusal(afterwards, 401, 'session_revoked');

    // The challenge is spent: its row is gone, and even the right code no longer completes it.
    expect(await tokenRowOf('confirm-mfa', mfaToken)).toBeUndefined();
    const completed = await call(signInWithTotp, {
      body: { code: currentCode() },
      headers: { ...defaultHeaders, Cookie: mfaCookie },
    });
    await expectRefusal(completed, 401, 'confirm-mfa_not_found');

    // Only this browser signed out: exactly one session is revoked, and the user's other session still works.
    const sessions = await sessionsOf(user.id);
    expect(sessions.filter((session) => session.revokedAt)).toEqual([
      expect.objectContaining({ revokedBy: user.id, revocationReason: 'sign_out' }),
    ]);
    const other = await call(getMe, { headers: { ...defaultHeaders, Cookie: otherSessionCookie } });
    expect(other.response.status).toBe(200);
  });

  it('cancels a pending MFA challenge that has no session beside it', async () => {
    const user = await createTotpUser('owner@security-test.com');
    const mfaToken = await createMfaToken(user);

    const { response } = await call(signOut, {
      headers: { ...defaultHeaders, Cookie: authCookie('confirm-mfa', mfaToken) },
    });

    expect(response.status).toBe(204);
    expect(await tokenRowOf('confirm-mfa', mfaToken)).toBeUndefined();
  });
});
