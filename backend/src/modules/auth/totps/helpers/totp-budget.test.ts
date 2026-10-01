import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import { memoryStores } from '#/middlewares/rate-limiter/tests/memory-stores';
import type { TotpUser } from '#/modules/auth/totps/helpers/totp-budget';
import { testTotpSecret, totpCode, wrongTotpCode } from '../../../../../tests/helpers';

// The account budget counts in the limiter stores: in-memory ones here, so a day's failures can be arranged.
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) =>
  (await import('#/middlewares/rate-limiter/tests/memory-stores')).memoryStoresMock(importOriginal),
);
vi.mock('#/modules/auth/general/helpers/send-account-security-email', () => ({ sendAccountSecurityEmail: vi.fn() }));

const { verifyTotp } = await import('#/modules/auth/totps/operations/verify-totp');
const { sendAccountSecurityEmail } = await import('#/modules/auth/general/helpers/send-account-security-email');
const { appErrorHandler } = await import('#/lib/error');

/** A check of `code` against a fresh account's pending secret, so no code is spent and no row is read. */
function accountChecks() {
  const user: TotpUser = { id: `user_${nanoid(8)}`, email: 'owner@example.com', name: 'Owner', language: 'en' };
  const app = new Hono<Env>();
  app.onError(appErrorHandler);
  app.post('/check', async (ctx) => {
    await verifyTotp(ctx, { user, code: await ctx.req.text(), pendingSecret: testTotpSecret });
    return ctx.body(null, 204);
  });
  const check = async (code: string) => (await app.request('http://localhost/check', { method: 'POST', body: code })).status;
  return { user, check };
}

const lockoutMails = () => vi.mocked(sendAccountSecurityEmail).mock.calls.map(([, type, params]) => [type, params]);

describe('the account budget behind TOTP checks', () => {
  beforeEach(() => vi.mocked(sendAccountSecurityEmail).mockClear());

  it("ends the hourly series on a verified code and keeps the day's count", async () => {
    const { user, check } = accountChecks();

    for (let failure = 0; failure < 4; failure++) expect(await check(wrongTotpCode())).toBe(401);
    expect(await check(totpCode())).toBe(204);

    // A whole hourly budget again, and the failure that spends it locks the account and mails the owner once.
    for (let failure = 0; failure < 5; failure++) expect(await check(wrongTotpCode())).toBe(401);
    expect(await check(totpCode())).toBe(429);
    expect(lockoutMails()).toEqual([['totp-lockout', { attempts: 5, duration: 30 }]]);
    expect((await memoryStores.get('totpAccount:slow')?.get(`userId:${user.id}`))?.consumedPoints).toBe(9);
  });

  it("must not let an account's codes be guessed past the day's budget via series the hour forgets", async () => {
    const { user, check } = accountChecks();
    const daily = memoryStores.get('totpAccount:slow');
    expect(daily).toBeDefined();
    // The day's budget but one is spent, in series the hourly bucket has long forgotten.
    await daily?.set(`userId:${user.id}`, 99, 60 * 60 * 24);

    expect(await check(wrongTotpCode())).toBe(401);
    expect(lockoutMails()).toEqual([['totp-lockout', { attempts: 100, duration: 180 }]]);
    expect(await check(totpCode())).toBe(429);
  });
});
