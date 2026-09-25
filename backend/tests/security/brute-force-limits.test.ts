import { decodeBase32 } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { checkEmail, signInWithTotp, toggleMfa } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
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
vi.mock('#/lib/mailer', () => ({ mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) } }));

const currentCode = () =>
  generateTOTP(decodeBase32('JBSWY3DPEHPK3PXP'), appConfig.totp.intervalInSeconds, appConfig.totp.digits);
const wrongCode = () => currentCode().replace(/^./, (digit) => String((Number(digit) + 5) % 10));

/** A fresh client IP per test: limiter rows outlive a run, and the IP-keyed budgets must start empty. */
const randomIp = () => `198.51.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
const fromIp = (ip: string) => ({ ...defaultHeaders, 'x-forwarded-for': ip });

/** The TOTP lockout mails handed to the mailer for `email`. */
const lockoutMailsTo = (email: string) =>
  vi
    .mocked(mailer.prepareEmails)
    .mock.calls.filter(
      ([, statics, recipients]) =>
        (statics as { type?: string }).type === 'totp-lockout' &&
        (recipients as { email: string }[]).some((recipient) => recipient.email === email),
    );

/**
 * Failure budgets end a guessing run: after the configured number of failures the next attempt is refused with 429,
 * even when it would succeed. Every other backend test mocks the limiters, so this file is where they are proven.
 */
describe('brute-force budgets', async () => {
  const call = await createAppClient();

  afterEach(async () => {
    await clearSecurityTestData();
    vi.mocked(mailer.prepareEmails).mockClear();
  });

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

  it('must not keep looking up addresses via check-email', async () => {
    const ip = randomIp();
    const known = await createTestUser(`known-${nanoid(6)}@security-test.com`.toLowerCase());

    // Every lookup counts, whatever it answers: a hit as much as a miss.
    for (let attempt = 0; attempt < 30; attempt++) {
      const email = attempt % 2 ? known.email : `nobody-${nanoid(6)}@security-test.com`.toLowerCase();
      const { response } = await call(checkEmail, { body: { email }, headers: fromIp(ip) });
      expect(response.status).toBe(200);
    }
    const blocked = await call(checkEmail, { body: { email: known.email }, headers: fromIp(ip) });
    expect(blocked.response.status).toBe(429);

    // Another client is unaffected (positive control).
    const other = await call(checkEmail, { body: { email: known.email }, headers: fromIp(randomIp()) });
    expect(other.response.status).toBe(200);
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

  it("must not keep guessing one account's authenticator codes from many IPs via totp-verification", async () => {
    const user = await createTotpUser(`totp-spread-${nanoid(8)}@security-test.com`);
    const cookie = authCookie('confirm-mfa', await createMfaToken(user));

    // One wrong code from each of five addresses: every IP budget stays far from its limit.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { response } = await call(signInWithTotp, {
        body: { code: wrongCode() },
        headers: { ...fromIp(randomIp()), Cookie: cookie },
      });
      expect(response.status).toBe(401);
    }

    // The account's own budget is spent: refused even with the right code, from yet another address.
    const { response } = await call(signInWithTotp, {
      body: { code: currentCode() },
      headers: { ...fromIp(randomIp()), Cookie: cookie },
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('set-cookie') ?? '').not.toContain('-session-');
    // The owner hears of it once, when the budget ran out.
    expect(lockoutMailsTo(user.email)).toHaveLength(1);
  });

  it('lets the owner through from many IPs before the account budget runs out (positive control)', async () => {
    const user = await createTotpUser(`totp-spread-ok-${nanoid(8)}@security-test.com`);
    const cookie = authCookie('confirm-mfa', await createMfaToken(user));

    for (let attempt = 0; attempt < 4; attempt++) {
      const { response } = await call(signInWithTotp, {
        body: { code: wrongCode() },
        headers: { ...fromIp(randomIp()), Cookie: cookie },
      });
      expect(response.status).toBe(401);
    }
    const { response } = await call(signInWithTotp, {
      body: { code: currentCode() },
      headers: { ...fromIp(randomIp()), Cookie: cookie },
    });
    expect(response.status).toBe(204);
    expect(lockoutMailsTo(user.email)).toHaveLength(0);
  });
});
