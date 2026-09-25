import { decodeBase32 } from '@oslojs/encoding';
import { and, eq } from 'drizzle-orm';
import { generatePasskeyChallenge, signInWithPasskey, signInWithTotp } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { authCookie, createMfaToken, createTotpUser, type ErrorResponse } from '../helpers';
import { softwarePasskey } from '../software-passkey';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

/** The Base32 secret `createTotpUser` stores. */
const totpSecret = 'JBSWY3DPEHPK3PXP';
const currentCode = () =>
  generateTOTP(decodeBase32(totpSecret), appConfig.totp.intervalInSeconds, appConfig.totp.digits);

const sessionCookieSet = (res: Response) => res.headers.getSetCookie().some((line) => line.includes('-session-'));

const confirmMfaRowOf = async (rawToken: string) => {
  const [row] = await db
    .select()
    .from(tokensTable)
    .where(and(eq(tokensTable.type, 'confirm-mfa'), eq(tokensTable.secret, hashToken(rawToken))));
  return row;
};

const sessionsOf = (userId: string) => db.select().from(sessionsTable).where(eq(sessionsTable.userId, userId));

beforeAll(() => mockFetchRequest());

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

    const first = await totpSignIn(currentCode(), mfaCookie);
    expect(first.response.status).toBe(204);
    expect(sessionCookieSet(first.response)).toBe(true);

    // The cookie the browser held, sent again with a right code: the challenge is spent.
    const replay = await totpSignIn(currentCode(), mfaCookie);
    expect(replay.response.status).toBe(401);
    expect((replay.error as ErrorResponse).type).toBe('confirm-mfa_not_found');
    expect(sessionCookieSet(replay.response)).toBe(false);
    expect(await sessionsOf(user.id)).toHaveLength(1);
    expect(await confirmMfaRowOf(mfaToken)).toBeUndefined();
  });

  it('keeps the challenge open after a wrong code, and completes it with the right one (positive control)', async () => {
    const user = await createTotpUser('owner@security-test.com');
    const mfaToken = await createMfaToken(user);
    const mfaCookie = authCookie('confirm-mfa', mfaToken);
    const wrongCode = currentCode() === '000000' ? '111111' : '000000';

    const failed = await totpSignIn(wrongCode, mfaCookie);
    expect(failed.response.status).toBe(401);
    expect((failed.error as ErrorResponse).type).toBe('invalid_token');
    expect(sessionCookieSet(failed.response)).toBe(false);
    expect(await confirmMfaRowOf(mfaToken)).toBeDefined();

    const completed = await totpSignIn(currentCode(), mfaCookie);
    expect(completed.response.status).toBe(204);
    expect(sessionCookieSet(completed.response)).toBe(true);
    expect(await confirmMfaRowOf(mfaToken)).toBeUndefined();
  });

  it("must not open a second session via a completed challenge's cookie and a passkey", async () => {
    const user = await createTotpUser('owner@security-test.com');
    const passkey = softwarePasskey();
    await db.insert(passkeysTable).values({
      userId: user.id,
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter: 0,
      nameOnDevice: 'Test device',
      deviceType: 'desktop',
    });
    const mfaToken = await createMfaToken(user);
    const mfaCookie = authCookie('confirm-mfa', mfaToken);

    /** A passkey completion of the challenge, with a fresh WebAuthn challenge each time. */
    const passkeySignIn = async (counter: number) => {
      const challenged = await call(generatePasskeyChallenge, {
        body: { type: 'mfa' },
        headers: { ...defaultHeaders, Cookie: mfaCookie },
      });
      const challengeCookie = challenged.response.headers
        .getSetCookie()
        .find((line) => line.startsWith(`${authCookieName('passkey-challenge')}=`))
        ?.split(';')[0];
      const challenge = (challenged.data as { challenge?: string } | undefined)?.challenge ?? 'no-challenge';
      return call(signInWithPasskey, {
        body: { type: 'mfa', assertion: passkey.assert(challenge, { counter }) },
        headers: { ...defaultHeaders, Cookie: [mfaCookie, challengeCookie].filter(Boolean).join('; ') },
      });
    };

    const first = await passkeySignIn(1);
    expect(first.response.status).toBe(204);
    expect(sessionCookieSet(first.response)).toBe(true);

    const replay = await passkeySignIn(2);
    expect(replay.response.status).toBe(401);
    expect((replay.error as ErrorResponse).type).toBe('confirm-mfa_not_found');
    expect(sessionCookieSet(replay.response)).toBe(false);
    expect(await sessionsOf(user.id)).toHaveLength(1);
  });
});
