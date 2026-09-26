import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';

// Undo setup.ts mock: this test drives the REAL spamLimiter export end to end.
vi.unmock('#/middlewares/rate-limiter/core');

const { penaltySpy, rewardSpy } = vi.hoisted(() => ({
  // The attempt reserved before the handler, as the store reports it back.
  penaltySpy: vi.fn().mockResolvedValue({ consumedPoints: 1, remainingPoints: 9, msBeforeNext: 0 }),
  rewardSpy: vi.fn().mockResolvedValue({ consumedPoints: 0, remainingPoints: 10, msBeforeNext: 0 }),
}));

vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) => {
  const original = await importOriginal<typeof import('#/middlewares/rate-limiter/helpers')>();
  return {
    ...original,
    getRateLimiterInstance: () => ({
      points: 10,
      get: vi.fn(async () => ({ consumedPoints: 1, remainingPoints: 9, msBeforeNext: 0 })),
      penalty: penaltySpy,
      reward: rewardSpy,
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
  beforeEach(() => {
    penaltySpy.mockClear();
    rewardSpy.mockClear();
  });

  it('consumes a point on 204 responses', async () => {
    // sendMagicLink and resendInvitationWithToken return 204, which the default successStatusCodes do not cover
    const res = await request(appReturning(204));
    expect(res.status).toBe(204);
    expect(penaltySpy).toHaveBeenCalledWith('ip:1.2.3.4', 1);
    expect(rewardSpy).not.toHaveBeenCalled();
  });

  it('consumes a point on 200 responses', async () => {
    await request(appReturning(200));
    expect(penaltySpy).toHaveBeenCalledWith('ip:1.2.3.4', 1);
    expect(rewardSpy).not.toHaveBeenCalled();
  });

  it('does not count failed requests', async () => {
    await request(appReturning(401));
    // The point reserved before the handler goes back.
    expect(penaltySpy).toHaveBeenCalledTimes(1);
    expect(rewardSpy).toHaveBeenCalledExactlyOnceWith('ip:1.2.3.4', 1);
  });
});
