import { decodeBase32 } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { checkEmail, sendMagicLink, signInWithTotp, stepUp } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAdminDb } from '#/db/db';
import { rateLimitsTable } from '#/modules/auth/rate-limits-db';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { magicLinkEmail } from '../../emails';
import { defaultHeaders } from '../fixtures';
import { authCookie, createMfaToken, createTestUser, createTotpUser, mailsTo, sessionRow } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';
import { insertSession } from './session-helpers';

// The suite mocks every limiter as a pass-through (tests/setup.ts); this file needs the real one.
vi.unmock('#/middlewares/rate-limiter/core');
const currentCode = () =>
  generateTOTP(decodeBase32('JBSWY3DPEHPK3PXP'), appConfig.totp.intervalInSeconds, appConfig.totp.digits);
const wrongCode = () => currentCode().replace(/^./, (digit) => String((Number(digit) + 5) % 10));

/** A fresh client IP per test: limiter rows outlive a run, and the IP-keyed budgets must start empty. */
const randomIp = () => `198.51.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
const fromIp = (ip: string) => ({ ...defaultHeaders, 'x-forwarded-for': ip });

const lockoutMailsTo = (email: string) => mailsTo(email).filter(({ statics }) => statics.type === 'totp-lockout');
const magicLinkMailsTo = (email: string) => mailsTo(email).filter(({ template }) => template === magicLinkEmail);

/**
 * Failure budgets end a guessing run: after the configured number of failures the next attempt is refused with 429,
 * even when it would succeed. Every other backend test mocks the limiters, so this file is where they are proven.
 */
describe('brute-force budgets', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  it('must not keep mailing an address magic links via /auth/magic/send from ever new client addresses', async () => {
    const owner = await createTestUser(`magic-limit-${nanoid(8)}@security-test.com`.toLowerCase());
    const other = await createTestUser(`magic-other-${nanoid(8)}@security-test.com`.toLowerCase());
    /** A request for a link to `email`, each from a client address of its own: the budget is the mailbox's. */
    const request = async (email: string) =>
      (await call(sendMagicLink, { body: { email }, headers: fromIp(randomIp()) })).response;

    for (let attempt = 0; attempt < 2; attempt++) expect((await request(owner.email)).status).toBe(204);

    const blocked = await request(owner.email);
    expect(blocked.status).toBe(429);
    expect(magicLinkMailsTo(owner.email)).toHaveLength(2);

    // Another address is unaffected (positive control).
    expect((await request(other.email)).status).toBe(204);
    expect(magicLinkMailsTo(other.email)).toHaveLength(1);
  });

  it('must not keep guessing authenticator codes via /auth/step-up', async () => {
    const user = await createTotpUser(`step-up-limit-${nanoid(8)}@security-test.com`);
    const session = await insertSession(user);

    for (let attempt = 0; attempt < 5; attempt++) {
      const { response } = await call(stepUp, { body: { totpCode: wrongCode() }, headers: session.headers });
      expect(response.status).toBe(401);
    }

    // Blocked now, even with the right code.
    const { response } = await call(stepUp, { body: { totpCode: currentCode() }, headers: session.headers });
    expect(response.status).toBe(429);
    expect((await sessionRow(session.id)).steppedUpAt).toBeNull();
  });

  it('lets the owner through with the right code before the budget runs out (positive control)', async () => {
    const user = await createTotpUser(`step-up-limit-ok-${nanoid(8)}@security-test.com`);
    const session = await insertSession(user);

    expect((await call(stepUp, { body: { totpCode: wrongCode() }, headers: session.headers })).response.status).toBe(
      401,
    );
    const { response } = await call(stepUp, { body: { totpCode: currentCode() }, headers: session.headers });
    expect(response.status).toBe(204);
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

  it('must not resume looking up addresses via check-email when the window ends inside the block', async () => {
    const ip = randomIp();
    const known = await createTestUser(`blocked-${nanoid(6)}@security-test.com`.toLowerCase());
    const lookup = async () =>
      (await call(checkEmail, { body: { email: known.email }, headers: fromIp(ip) })).response.status;
    const minutes = (count: number) => count * 60 * 1000;

    // Only the clock moves: 30 lookups an hour, then a 30-minute block from the lookup past the budget.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const start = Date.now();
      for (let attempt = 0; attempt < 30; attempt++) expect(await lookup()).toBe(200);

      // Past the budget late in the window: the block runs from here, beyond the window's end.
      vi.setSystemTime(start + minutes(50));
      expect(await lookup()).toBe(429);
      vi.setSystemTime(start + minutes(65));
      expect(await lookup()).toBe(429);

      // Lookups resume once the block ends (positive control).
      vi.setSystemTime(start + minutes(81));
      expect(await lookup()).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("must not keep guessing many accounts' second factors from one IP via totp-verification", async () => {
    const ip = randomIp();
    /** A second-factor challenge of an account of its own, answered with `code` from `from`. */
    const answerFrom = async (from: string, code: string) => {
      const user = await createTotpUser(`totp-ip-${nanoid(8)}@security-test.com`);
      const Cookie = authCookie('confirm-mfa', await createMfaToken(user));
      return (await call(signInWithTotp, { body: { code }, headers: { ...fromIp(from), Cookie } })).response;
    };

    // One wrong code for each of five accounts: every account's own budget stays far from its limit.
    for (let account = 0; account < 5; account++) expect((await answerFrom(ip, wrongCode())).status).toBe(401);

    // The address is spent: refused even with the right code of yet another account.
    const blocked = await answerFrom(ip, currentCode());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('set-cookie') ?? '').not.toContain('-session-');

    // Another address is unaffected (positive control).
    expect((await answerFrom(randomIp(), currentCode())).status).toBe(204);
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

  it("must not check more of one account's codes than its budget via a parallel burst", async () => {
    const user = await createTotpUser(`totp-burst-${nanoid(8)}@security-test.com`);
    const cookie = authCookie('confirm-mfa', await createMfaToken(user));

    // Twenty wrong codes at once, each from its own address, against an account with its whole budget left. A burst of
    // this size overlaps the attempts closely enough that a budget counted by read-then-write lets more through.
    const statuses = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const { response } = await call(signInWithTotp, {
          body: { code: wrongCode() },
          headers: { ...fromIp(randomIp()), Cookie: cookie },
        });
        return response.status;
      }),
    );
    expect(statuses.filter((status) => status === 401)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(15);
    // One lockout, one mail.
    expect(lockoutMailsTo(user.email)).toHaveLength(1);

    const { response } = await call(signInWithTotp, {
      body: { code: currentCode() },
      headers: { ...fromIp(randomIp()), Cookie: cookie },
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('set-cookie') ?? '').not.toContain('-session-');
  });

  it("must not keep one account's TOTP checks locked in a process after the lockout ended in the database", async () => {
    const user = await createTotpUser(`totp-ended-${nanoid(8)}@security-test.com`);
    const cookie = authCookie('confirm-mfa', await createMfaToken(user));
    const attempt = async (code: string) =>
      (await call(signInWithTotp, { body: { code }, headers: { ...fromIp(randomIp()), Cookie: cookie } })).response;

    for (let failure = 0; failure < 5; failure++) expect((await attempt(wrongCode())).status).toBe(401);
    expect((await attempt(currentCode())).status).toBe(429);

    // The lockout runs out in the database, which every process reads.
    await getAdminDb('rate limit test')
      .update(rateLimitsTable)
      .set({ expire: new Date(Date.now() - 1000) })
      .where(eq(rateLimitsTable.key, `totpAccount:userId:${user.id}`));

    const response = await attempt(currentCode());
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie') ?? '').toContain('-session-');
    expect(lockoutMailsTo(user.email)).toHaveLength(1);
  });
});
