import { decodeBase32 } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { deletePasskey, deleteTotp, generatePasskeyChallenge, getStepUpPasskeyChallenge, toggleMfa } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mockPasskeyRecord } from '#/modules/auth/auth-mocks';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import { createTestSession, createTotpUser, type ErrorResponse } from '../helpers';
import { softwarePasskey } from '../software-passkey';
import { createAppClient, type TestResult } from '../test-client';
import { clearSecurityTestData } from './helpers';

/** The Base32 secret `createTotpUser` stores. */
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const currentCode = () =>
  generateTOTP(decodeBase32(TOTP_SECRET), appConfig.totp.intervalInSeconds, appConfig.totp.digits);
/** A well-formed code that is not the current one (nor inside the grace window). */
const wrongCode = () => {
  const code = currentCode();
  return code.replace(/^./, (digit) => String((Number(digit) + 5) % 10));
};

/** Past the step-up window. */
const STALE_MS = 60 * 60 * 1000;

const mfaRequiredOf = async (userId: string) =>
  (await db.select({ mfaRequired: usersTable.mfaRequired }).from(usersTable).where(eq(usersTable.id, userId)))[0]
    ?.mfaRequired;

/**
 * Turning MFA on or off changes how the account is protected, so a session alone must never be enough: the person
 * proves a second factor on the same request, or the session stepped up with one. A stolen session could otherwise
 * switch MFA off, or switch it on with a factor the owner does not hold.
 */
describe('MFA toggle step-up', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  /** `signedInAgoMs` past the step-up window makes the session a session alone: its sign-in no longer proves a factor. */
  async function totpUserWithSession(mfaRequired: boolean, { withPasskey = true, signedInAgoMs = 0 } = {}) {
    const user = await createTotpUser(`mfa-${nanoid(8)}@security-test.com`);
    if (!mfaRequired) await db.update(usersTable).set({ mfaRequired: false }).where(eq(usersTable.id, user.id));
    const [passkey] = withPasskey
      ? await db.insert(passkeysTable).values(mockPasskeyRecord(user.id)).returning()
      : [undefined];
    const sessionCookie = await createTestSession(user, { ageMs: signedInAgoMs });
    return { user, passkey, headers: { ...defaultHeaders, Cookie: sessionCookie } };
  }

  it('must not disable MFA via PUT /me/mfa with a session and no second factor', async () => {
    const { user, headers } = await totpUserWithSession(true, { signedInAgoMs: STALE_MS });
    const { error, response } = await call(toggleMfa, { body: { mfaRequired: false }, headers });
    expect(response.status).toBe(403);
    expect((error as ErrorResponse).type).toBe('step_up_required');
    expect(await mfaRequiredOf(user.id)).toBe(true);
  });

  it('must not disable MFA via a wrong TOTP code', async () => {
    const { user, headers } = await totpUserWithSession(true);
    const { error, response } = await call(toggleMfa, {
      body: { mfaRequired: false, totpCode: wrongCode() },
      headers,
    });
    expect(response.status).toBe(401);
    expect((error as ErrorResponse).type).toBe('invalid_token');
    expect(await mfaRequiredOf(user.id)).toBe(true);
  });

  it('disables MFA with the current TOTP code (positive control)', async () => {
    const { user, headers } = await totpUserWithSession(true);
    const { response } = await call(toggleMfa, { body: { mfaRequired: false, totpCode: currentCode() }, headers });
    expect(response.status).toBe(200);
    expect(await mfaRequiredOf(user.id)).toBe(false);
  });

  // MFA keeps two factors so a lost one can be replaced: removing either while MFA is on would switch it off unasked.
  it('must not turn MFA off by deleting the authenticator app via deleteTotp', async () => {
    const { user, headers } = await totpUserWithSession(true);
    const { error, response } = await call(deleteTotp, { headers });
    expect(response.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('mfa_factor_in_use');
    expect(await mfaRequiredOf(user.id)).toBe(true);
    expect(await db.select().from(totpsTable).where(eq(totpsTable.userId, user.id))).toHaveLength(1);
  });

  it('must not turn MFA off by deleting the last passkey via deletePasskey', async () => {
    const { user, passkey, headers } = await totpUserWithSession(true);
    const { error, response } = await call(deletePasskey, { path: { id: passkey!.id }, headers });
    expect(response.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('mfa_factor_in_use');
    expect(await mfaRequiredOf(user.id)).toBe(true);
    expect(await db.select().from(passkeysTable).where(eq(passkeysTable.userId, user.id))).toHaveLength(1);
  });

  it('must not turn on MFA without both a passkey and an authenticator app', async () => {
    const { user, headers } = await totpUserWithSession(false, { withPasskey: false });
    const { error, response } = await call(toggleMfa, {
      body: { mfaRequired: true, totpCode: currentCode() },
      headers,
    });
    expect(response.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('mfa_factors_required');
    expect(await mfaRequiredOf(user.id)).toBe(false);
  });

  it('turns on MFA with both factors, and deletes a factor while MFA is off (positive controls)', async () => {
    const on = await totpUserWithSession(false);
    const enabled = await call(toggleMfa, {
      body: { mfaRequired: true, totpCode: currentCode() },
      headers: on.headers,
    });
    expect(enabled.response.status).toBe(200);
    expect(await mfaRequiredOf(on.user.id)).toBe(true);

    const off = await totpUserWithSession(false);
    expect((await call(deleteTotp, { headers: off.headers })).response.status).toBe(204);
    expect((await call(deletePasskey, { path: { id: off.passkey!.id }, headers: off.headers })).response.status).toBe(
      204,
    );
  });

  it('must not switch MFA off via a passkey proof on the request that answers a sign-in challenge', async () => {
    const { user } = await totpUserWithSession(true, { withPasskey: false });
    const passkey = softwarePasskey();
    await db.insert(passkeysTable).values({
      userId: user.id,
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter: 0,
      nameOnDevice: 'Test device',
      deviceType: 'desktop',
    });
    const sessionCookie = await createTestSession(user, { ageMs: STALE_MS });

    /** The challenge a response issued, answered by the passkey and sent with the MFA toggle, as the page would. */
    const toggleWith = (issued: TestResult) => {
      const challengeCookie = issued.response.headers
        .getSetCookie()
        .map((line) => line.split(';')[0])
        .find((pair) => pair.startsWith(`${authCookieName('passkey-challenge')}=`));
      const { challenge } = issued.data as { challenge: string };
      return call(toggleMfa, {
        body: { mfaRequired: false, passkeyData: passkey.assert(challenge) },
        headers: { ...defaultHeaders, Cookie: `${sessionCookie}; ${challengeCookie}` },
      });
    };

    const signInChallenge = await call(generatePasskeyChallenge, {
      body: { type: 'authentication' },
      headers: defaultHeaders,
    });
    const refused = await toggleWith(signInChallenge);
    expect(refused.response.status).toBe(401);
    expect((refused.error as ErrorResponse).type).toBe('passkey_verification_failed');
    expect(await mfaRequiredOf(user.id)).toBe(true);

    // Positive control: a proof on the request still works on a session that has not stepped up, for a step-up challenge.
    const stepUpChallenge = await call(getStepUpPasskeyChallenge, {
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });
    expect((await toggleWith(stepUpChallenge)).response.status).toBe(200);
    expect(await mfaRequiredOf(user.id)).toBe(false);
  });
});
