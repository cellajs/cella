import { decodeBase32 } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { checkEmail, signInWithTotp, toggleMfa } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mockPasskeyRecord } from '#/modules/auth/auth-mocks';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import { authCookie, createMfaToken, createTestSession, createTestUser, createTotpUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';

// The suite mocks every limiter as a pass-through (tests/setup.ts); this file needs the real one.
vi.unmock('#/middlewares/rate-limiter/core');

const currentCode = () =>
  generateTOTP(decodeBase32('JBSWY3DPEHPK3PXP'), appConfig.totp.intervalInSeconds, appConfig.totp.digits);
const wrongCode = () => currentCode().replace(/^./, (digit) => String((Number(digit) + 5) % 10));

/** A fresh client IP per test: limiter rows outlive a run, and the IP-keyed budgets must start empty. */
const randomIp = () => `198.51.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
const fromIp = (ip: string) => ({ ...defaultHeaders, 'x-forwarded-for': ip });

/**
 * Failure budgets end a guessing run: after the configured number of failures the next attempt is refused with 429,
 * even when it would succeed. Every other backend test mocks the limiters, so this file is where they are proven.
 */
describe('brute-force budgets', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  it('must not keep guessing authenticator codes via PUT /me/mfa', async () => {
    const user = await createTotpUser(`mfa-limit-${nanoid(8)}@security-test.com`);
    await db.insert(passkeysTable).values(mockPasskeyRecord(user.id));
    const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };

    for (let attempt = 0; attempt < 5; attempt++) {
      const { response } = await call(toggleMfa, { body: { mfaRequired: false, totpCode: wrongCode() }, headers });
      expect(response.status).toBe(401);
    }

    // Blocked now, even with the right code.
    const { response } = await call(toggleMfa, { body: { mfaRequired: false, totpCode: currentCode() }, headers });
    expect(response.status).toBe(429);
    const [row] = await db
      .select({ mfaRequired: usersTable.mfaRequired })
      .from(usersTable)
      .where(eq(usersTable.id, user.id));
    expect(row.mfaRequired).toBe(true);
  });

  it('lets the owner through with the right code before the budget runs out (positive control)', async () => {
    const user = await createTotpUser(`mfa-limit-ok-${nanoid(8)}@security-test.com`);
    await db.insert(passkeysTable).values(mockPasskeyRecord(user.id));
    const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };

    expect(
      (await call(toggleMfa, { body: { mfaRequired: false, totpCode: wrongCode() }, headers })).response.status,
    ).toBe(401);
    const { response } = await call(toggleMfa, { body: { mfaRequired: false, totpCode: currentCode() }, headers });
    expect(response.status).toBe(200);
  });

  it('must not keep probing which addresses have accounts via check-email', async () => {
    const ip = randomIp();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { response } = await call(checkEmail, {
        body: { email: `nobody-${nanoid(6)}@security-test.com`.toLowerCase() },
        headers: fromIp(ip),
      });
      expect(response.status).toBe(404);
    }
    const known = await createTestUser(`known-${nanoid(6)}@security-test.com`.toLowerCase());
    const blocked = await call(checkEmail, { body: { email: known.email }, headers: fromIp(ip) });
    expect(blocked.response.status).toBe(429);

    // Another client is unaffected (positive control).
    const other = await call(checkEmail, { body: { email: known.email }, headers: fromIp(randomIp()) });
    expect(other.response.status).toBe(204);
  });

  it('must not keep guessing the second factor at sign-in via totp-verification', async () => {
    const user = await createTotpUser(`totp-limit-${nanoid(8)}@security-test.com`);
    const mfaToken = await createMfaToken(user);
    const headers = { ...fromIp(randomIp()), Cookie: authCookie('confirm-mfa', mfaToken) };

    for (let attempt = 0; attempt < 5; attempt++) {
      const { response } = await call(signInWithTotp, { body: { code: wrongCode() }, headers });
      expect(response.status).toBe(401);
    }
    const { response } = await call(signInWithTotp, { body: { code: currentCode() }, headers });
    expect(response.status).toBe(429);
    expect(response.headers.get('set-cookie') ?? '').not.toContain('-session-');
  });
});
