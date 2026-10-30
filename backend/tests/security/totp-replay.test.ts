import { nanoid } from 'nanoid';
import { createTotp, generateTotpKey, signInWithTotp, stepUp } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultHeaders } from '../fixtures';
import {
  authCookie,
  cookieChange,
  createMfaToken,
  createTestSession,
  createTestUser,
  createTotpUser,
  expectRefusal,
  sessionRow,
  sessionsOf,
  setCookiePair,
  testTotpSecret,
  tokenRowOf,
  totpCode,
} from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';
import { insertSession } from './session-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

afterEach(async () => await clearSecurityTestData());

/**
 * A TOTP code counts once. Whoever sees a code go by (over a shoulder, in a phishing proxy, in a log) must not use it
 * again within its step, on any route that checks codes. A code verifies only within one step of now, so a guess
 * matches at most three codes.
 */
describe('TOTP replay', async () => {
  const call = await createAppClient();

  /** A second-factor challenge of its own, as each sign-in gets one, answered with `code`. */
  const answerChallenge = async (user: { id: string; email: string }, code: string) => {
    const mfaToken = await createMfaToken(user);
    const result = await call(signInWithTotp, { body: { code }, headers: { ...defaultHeaders, Cookie: authCookie('confirm-mfa', mfaToken) } });
    return { ...result, mfaToken };
  };

  it('must not complete a second-factor challenge via a replayed TOTP code', async () => {
    const user = await createTotpUser(`replay-${nanoid(8)}@security-test.com`);
    const code = totpCode();

    const first = await answerChallenge(user, code);
    expect(first.response.status).toBe(204);

    // Another challenge (another sign-in), answered with the code the first one used.
    const replay = await answerChallenge(user, code);
    await expectRefusal(replay, 401, 'totp_code_used');
    expect(cookieChange(replay.response, 'session')).toBeUndefined();
    expect(await tokenRowOf('confirm-mfa', replay.mfaToken)).toBeDefined();
    expect(await sessionsOf(user.id)).toHaveLength(1);

    // Positive control: the next code, a later step, answers the same challenge.
    const next = await call(signInWithTotp, {
      body: { code: totpCode(testTotpSecret, 1) },
      headers: { ...defaultHeaders, Cookie: authCookie('confirm-mfa', replay.mfaToken) },
    });
    expect(next.response.status).toBe(204);
    expect(await sessionsOf(user.id)).toHaveLength(2);
  });

  it('must not step up a session via a TOTP code already used to sign in', async () => {
    const user = await createTotpUser(`replay-step-up-${nanoid(8)}@security-test.com`);
    const code = totpCode();

    expect((await answerChallenge(user, code)).response.status).toBe(204);

    const session = await insertSession(user);
    const { error, response } = await call(stepUp, { body: { totpCode: code }, headers: session.headers });
    await expectRefusal({ response, error }, 401, 'totp_code_used');
    expect((await sessionRow(session.id)).steppedUpAt).toBeNull();
  });

  it('must not answer a second-factor challenge via the code that confirmed TOTP setup', async () => {
    const user = await createTestUser(`replay-setup-${nanoid(8)}@security-test.com`);
    const sessionCookie = await createTestSession(user);

    const generated = await call(generateTotpKey, { headers: { ...defaultHeaders, Cookie: sessionCookie } });
    expect(generated.response.status).toBe(200);
    const { manualKey } = generated.data as { manualKey: string };
    const challengeCookie = setCookiePair(generated.response, 'totp-challenge');

    const code = totpCode(manualKey);
    const created = await call(createTotp, {
      body: { code },
      headers: { ...defaultHeaders, Cookie: [sessionCookie, challengeCookie].join('; ') },
    });
    expect(created.response.status).toBe(201);

    const replay = await answerChallenge(user, code);
    await expectRefusal(replay, 401, 'totp_code_used');
    expect(cookieChange(replay.response, 'session')).toBeUndefined();

    // Positive control: the authenticator's next code signs in.
    expect((await answerChallenge(user, totpCode(manualKey, 1))).response.status).toBe(204);
  });

  it('must not open two sessions via one TOTP code sent twice at once', async () => {
    const user = await createTotpUser(`replay-race-${nanoid(8)}@security-test.com`);
    const code = totpCode();

    const results = await Promise.all([answerChallenge(user, code), answerChallenge(user, code)]);
    const statuses = results.map(({ response }) => response.status).sort();
    expect(statuses).toEqual([204, 401]);
    expect(await sessionsOf(user.id)).toHaveLength(1);
  });

  it('must not verify a code two steps from now via the clock-drift window', async () => {
    const user = await createTotpUser(`window-${nanoid(8)}@security-test.com`);
    const stepMs = appConfig.totp.intervalInSeconds * 1000;

    // The clock stands mid-step, so each code is checked in the step it was computed in.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Math.floor(Date.now() / stepMs) * stepMs + stepMs / 2);
      for (const steps of [2, -2]) await expectRefusal(await answerChallenge(user, totpCode(testTotpSecret, steps)), 401, 'invalid_token');

      // Positive control: one step either side verifies, the earlier one first, since a code spends the steps before it.
      expect((await answerChallenge(user, totpCode(testTotpSecret, -1))).response.status).toBe(204);
      expect((await answerChallenge(user, totpCode(testTotpSecret, 1))).response.status).toBe(204);
    } finally {
      vi.useRealTimers();
    }
  });
});
