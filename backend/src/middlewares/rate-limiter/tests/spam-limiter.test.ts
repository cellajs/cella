import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';

// Undo setup.ts mock: this test drives the REAL spamLimiter export end to end.
vi.unmock('#/middlewares/rate-limiter/core');

const { consumeSpy } = vi.hoisted(() => ({
  consumeSpy: vi.fn().mockResolvedValue({ consumedPoints: 1, remainingPoints: 9, msBeforeNext: 0 }),
}));

// Keep the import chain lean: the lockout helper pulls in db/mailer, irrelevant here.
vi.mock('#/middlewares/rate-limiter/send-lockout-email', () => ({ sendLockoutEmail: vi.fn() }));

vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) => {
  const original = await importOriginal<typeof import('#/middlewares/rate-limiter/helpers')>();
  return {
    ...original,
    getRateLimiterInstance: () => ({
      points: 10,
      get: vi.fn(async () => null),
      consume: consumeSpy,
      delete: vi.fn(async () => {}),
    }),
  };
});

// Must import AFTER mocks are set up
const { spamLimiter } = await import('#/middlewares/rate-limiter/limiters');

function appReturning(status: 200 | 204 | 401) {
  const app = new Hono<Env>();
  app.post('/send', spamLimiter, (c) => (status === 204 ? c.body(null, 204) : c.json({}, status)));
  return app;
}

const request = (app: Hono<Env>) =>
  app.request('http://localhost/send', { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' } });

describe('spamLimiter status handling', () => {
  beforeEach(() => consumeSpy.mockClear());

  it('consumes a point on 204 responses', async () => {
    // sendMagicLink and resendInvitationWithToken both return 204. With the default
    // successStatusCodes [200, 201] the spam limiter never consumed a point on them,
    // leaving those email-sending endpoints with no effective rate limit at all.
    const res = await request(appReturning(204));
    expect(res.status).toBe(204);
    expect(consumeSpy).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('consumes a point on 200 responses', async () => {
    await request(appReturning(200));
    expect(consumeSpy).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('does not consume on failed requests', async () => {
    await request(appReturning(401));
    expect(consumeSpy).not.toHaveBeenCalled();
  });
});
