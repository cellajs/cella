import { decodeBase32 } from '@oslojs/encoding';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createTotp, generateTotpKey, signInWithTotp, toggleMfa } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mockPasskeyRecord } from '#/modules/auth/auth-mocks';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { usersTable } from '#/modules/user/user-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import {
  authCookie,
  createMfaToken,
  createTestSession,
  createTestUser,
  createTotpUser,
  type ErrorResponse,
} from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

const { intervalInSeconds, digits } = appConfig.totp;

/** The Base32 secret `createTotpUser` stores. */
const totpSecret = 'JBSWY3DPEHPK3PXP';
/** The code of the step `stepsAhead` steps from now: 0 is the current code, 1 the next one (inside the grace window). */
const codeAt = (stepsAhead = 0, secret = totpSecret) =>
  generateTOTP(
    decodeBase32(secret),
    intervalInSeconds,
    digits,
    Math.floor(Date.now() / 1000) + stepsAhead * intervalInSeconds,
  );

const sessionCookieSet = (res: Response) => res.headers.getSetCookie().some((line) => line.includes('-session-'));
const sessionsOf = (userId: string) => db.select().from(sessionsTable).where(eq(sessionsTable.userId, userId));
const confirmMfaRowOf = async (rawToken: string) => {
  const [row] = await db
    .select()
    .from(tokensTable)
    .where(and(eq(tokensTable.type, 'confirm-mfa'), eq(tokensTable.secret, hashToken(rawToken))));
  return row;
};

beforeAll(() => mockFetchRequest());

afterEach(async () => await clearSecurityTestData());

/**
 * A TOTP code counts once. Whoever sees a code go by (over a shoulder, in a phishing proxy, in a log) must not use it
 * again within its step, on any route that checks codes.
 */
describe('TOTP replay', async () => {
  const call = await createAppClient();

  /** A second-factor challenge of its own, as each sign-in gets one, answered with `code`. */
  const answerChallenge = async (user: { id: string; email: string }, code: string) => {
    const mfaToken = await createMfaToken(user);
    const result = await call(signInWithTotp, {
      body: { code },
      headers: { ...defaultHeaders, Cookie: authCookie('confirm-mfa', mfaToken) },
    });
    return { ...result, mfaToken };
  };

  it('must not complete a second-factor challenge via a replayed TOTP code', async () => {
    const user = await createTotpUser(`replay-${nanoid(8)}@security-test.com`);
    const code = codeAt();

    const first = await answerChallenge(user, code);
    expect(first.response.status).toBe(204);

    // Another challenge (another sign-in), answered with the code the first one used.
    const replay = await answerChallenge(user, code);
    expect(replay.response.status).toBe(401);
    expect((replay.error as ErrorResponse).type).toBe('totp_code_used');
    expect(sessionCookieSet(replay.response)).toBe(false);
    expect(await confirmMfaRowOf(replay.mfaToken)).toBeDefined();
    expect(await sessionsOf(user.id)).toHaveLength(1);

    // Positive control: the next code, a later step, answers the same challenge.
    const next = await call(signInWithTotp, {
      body: { code: codeAt(1) },
      headers: { ...defaultHeaders, Cookie: authCookie('confirm-mfa', replay.mfaToken) },
    });
    expect(next.response.status).toBe(204);
    expect(await sessionsOf(user.id)).toHaveLength(2);
  });

  it('must not turn MFA off via a TOTP code already used to sign in', async () => {
    const user = await createTotpUser(`replay-toggle-${nanoid(8)}@security-test.com`);
    await db.insert(passkeysTable).values(mockPasskeyRecord(user.id));
    const code = codeAt();

    expect((await answerChallenge(user, code)).response.status).toBe(204);

    const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };
    const { error, response } = await call(toggleMfa, { body: { mfaRequired: false, totpCode: code }, headers });
    expect(response.status).toBe(401);
    expect((error as ErrorResponse).type).toBe('totp_code_used');
    const [row] = await db
      .select({ mfaRequired: usersTable.mfaRequired })
      .from(usersTable)
      .where(eq(usersTable.id, user.id));
    expect(row.mfaRequired).toBe(true);
  });

  it('must not answer a second-factor challenge via the code that confirmed TOTP setup', async () => {
    const user = await createTestUser(`replay-setup-${nanoid(8)}@security-test.com`);
    const sessionCookie = await createTestSession(user);

    const generated = await call(generateTotpKey, { headers: { ...defaultHeaders, Cookie: sessionCookie } });
    expect(generated.response.status).toBe(200);
    const { manualKey } = generated.data as { manualKey: string };
    const challengeCookie = generated.response.headers
      .getSetCookie()
      .find((line) => line.startsWith(`${authCookieName('totp-challenge')}=`))
      ?.split(';')[0];

    const code = codeAt(0, manualKey);
    const created = await call(createTotp, {
      body: { code },
      headers: { ...defaultHeaders, Cookie: [sessionCookie, challengeCookie].join('; ') },
    });
    expect(created.response.status).toBe(201);

    const replay = await answerChallenge(user, code);
    expect(replay.response.status).toBe(401);
    expect((replay.error as ErrorResponse).type).toBe('totp_code_used');
    expect(sessionCookieSet(replay.response)).toBe(false);

    // Positive control: the authenticator's next code signs in.
    expect((await answerChallenge(user, codeAt(1, manualKey))).response.status).toBe(204);
  });

  it('must not open two sessions via one TOTP code sent twice at once', async () => {
    const user = await createTotpUser(`replay-race-${nanoid(8)}@security-test.com`);
    const code = codeAt();

    const results = await Promise.all([answerChallenge(user, code), answerChallenge(user, code)]);
    const statuses = results.map(({ response }) => response.status).sort();
    expect(statuses).toEqual([204, 401]);
    expect(await sessionsOf(user.id)).toHaveLength(1);
  });
});
