import { signInWithTotp } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultHeaders } from '../fixtures';
import {
  authCookie,
  cookieChange,
  createMfaToken,
  createTotpUser,
  expectRefusal,
  sessionsOf,
  tokenRowOf,
  totpCode,
  wrongTotpCode,
} from '../helpers';
import { type PasskeyAssertion, softwarePasskey } from '../software-passkey';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, insertPasskey, passkeyChallenge, passkeySignIn } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

afterEach(async () => await clearSecurityTestData());

/**
 * A second-factor challenge stands for one sign-in. It ends when its factor verifies, so a copy of its cookie cannot
 * open a second session, and only then: a wrong code leaves it open for the next try.
 */
describe('Second-factor challenge', async () => {
  const call = await createAppClient();

  const totpSignIn = (code: string, cookie: string) =>
    call(signInWithTotp, { body: { code }, headers: { ...defaultHeaders, Cookie: cookie } });

  it("must not open a second session via a completed challenge's confirm-mfa cookie", async () => {
    const user = await createTotpUser('owner@security-test.com');
    const mfaToken = await createMfaToken(user);
    const mfaCookie = authCookie('confirm-mfa', mfaToken);

    const first = await totpSignIn(totpCode(), mfaCookie);
    expect(first.response.status).toBe(204);
    expect(cookieChange(first.response, 'session')).toBe('set');

    // The cookie the browser held, sent again with a right code: the challenge is spent.
    const replay = await totpSignIn(totpCode(), mfaCookie);
    await expectRefusal(replay, 401, 'confirm-mfa_not_found');
    expect(cookieChange(replay.response, 'session')).toBeUndefined();
    expect(await sessionsOf(user.id)).toHaveLength(1);
    expect(await tokenRowOf('confirm-mfa', mfaToken)).toBeUndefined();
  });

  it('keeps the challenge open after a wrong code, and completes it with the right one (positive control)', async () => {
    const user = await createTotpUser('owner@security-test.com');
    const mfaToken = await createMfaToken(user);
    const mfaCookie = authCookie('confirm-mfa', mfaToken);

    const failed = await totpSignIn(wrongTotpCode(), mfaCookie);
    await expectRefusal(failed, 401, 'invalid_token');
    expect(cookieChange(failed.response, 'session')).toBeUndefined();
    expect(await tokenRowOf('confirm-mfa', mfaToken)).toBeDefined();

    const completed = await totpSignIn(totpCode(), mfaCookie);
    expect(completed.response.status).toBe(204);
    expect(cookieChange(completed.response, 'session')).toBe('set');
    expect(await tokenRowOf('confirm-mfa', mfaToken)).toBeUndefined();
  });

  it("must not open a second session via a completed challenge's cookie and a passkey", async () => {
    const user = await createTotpUser('owner@security-test.com');
    const passkey = await insertPasskey(user);
    const mfaCookie = authCookie('confirm-mfa', await createMfaToken(user));

    const issued = await passkeyChallenge('mfa', mfaCookie);
    const first = await passkeySignIn(
      passkey.assert(issued.challenge, { counter: 1 }),
      `${mfaCookie}; ${issued.cookie}`,
      'mfa',
    );
    expect(first.response.status).toBe(204);
    expect(cookieChange(first.response, 'session')).toBe('set');

    // The cookie the browser held gets no passkey challenge any more, so its answer carries none.
    const replay = await passkeySignIn(passkey.assert('no-challenge', { counter: 2 }), mfaCookie, 'mfa');
    await expectRefusal(replay, 401, 'confirm-mfa_not_found');
    expect(cookieChange(replay.response, 'session')).toBeUndefined();
    expect(await sessionsOf(user.id)).toHaveLength(1);
  });

  it('keeps the challenge open after a failed passkey response, and completes it with a valid one (positive control)', async () => {
    const user = await createTotpUser('owner@security-test.com');
    const passkey = await insertPasskey(user);
    const mfaToken = await createMfaToken(user);
    const mfaCookie = authCookie('confirm-mfa', mfaToken);

    /** Answers a fresh MFA passkey challenge with the response `sign` makes for it. */
    const answer = async (sign: (challenge: string) => PasskeyAssertion) => {
      const issued = await passkeyChallenge('mfa', mfaCookie);
      return passkeySignIn(sign(issued.challenge), `${mfaCookie}; ${issued.cookie}`, 'mfa');
    };

    // Signed by another key under this passkey's id.
    const failed = await answer((challenge) => ({
      ...softwarePasskey().assert(challenge),
      id: passkey.credentialId,
      rawId: passkey.credentialId,
    }));
    await expectRefusal(failed, 401, 'passkey_verification_failed');
    expect(cookieChange(failed.response, 'session')).toBeUndefined();
    expect(await tokenRowOf('confirm-mfa', mfaToken)).toBeDefined();

    const completed = await answer((challenge) => passkey.assert(challenge));
    expect(completed.response.status).toBe(204);
    expect(cookieChange(completed.response, 'session')).toBe('set');
    expect(await tokenRowOf('confirm-mfa', mfaToken)).toBeUndefined();
  });
});
