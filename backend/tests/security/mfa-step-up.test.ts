import { decodeBase32 } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { toggleMfa } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import { createTestSession, createTotpUser, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
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

const mfaRequiredOf = async (userId: string) =>
  (await db.select({ mfaRequired: usersTable.mfaRequired }).from(usersTable).where(eq(usersTable.id, userId)))[0]
    ?.mfaRequired;

/**
 * Turning MFA on or off changes how the account is protected, so a session alone must never be enough: the person
 * proves a second factor on the same request. A stolen session could otherwise switch MFA off, or switch it on with a
 * factor the owner does not hold.
 */
describe('MFA toggle step-up', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  async function totpUserWithSession(mfaRequired: boolean) {
    const user = await createTotpUser(`mfa-${nanoid(8)}@security-test.com`);
    if (!mfaRequired) await db.update(usersTable).set({ mfaRequired: false }).where(eq(usersTable.id, user.id));
    const sessionCookie = await createTestSession(user);
    return { user, headers: { ...defaultHeaders, Cookie: sessionCookie } };
  }

  it('must not disable MFA via PUT /me/mfa with a session and no second factor', async () => {
    const { user, headers } = await totpUserWithSession(true);
    const { error, response } = await call(toggleMfa, { body: { mfaRequired: false }, headers });
    expect(response.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('invalid_request');
    expect(await mfaRequiredOf(user.id)).toBe(true);
  });

  it('must not enable MFA via PUT /me/mfa with a session and no second factor', async () => {
    const { user, headers } = await totpUserWithSession(false);
    const { response } = await call(toggleMfa, { body: { mfaRequired: true }, headers });
    expect(response.status).toBe(400);
    expect(await mfaRequiredOf(user.id)).toBe(false);
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
});
