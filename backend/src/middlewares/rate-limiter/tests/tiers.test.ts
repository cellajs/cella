import { type Context, Hono } from 'hono';
import { nanoid } from 'nanoid';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import type { RateLimiterHandler, RateLimitMode } from '#/middlewares/rate-limiter/types';
import { memoryStores } from './memory-stores';

// Undo the setup.ts mock: these tests drive the real middleware against in-memory stores.
vi.unmock('#/middlewares/rate-limiter/core');
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) => (await import('./memory-stores')).memoryStoresMock(importOriginal));

const { rateLimiter } = await import('#/middlewares/rate-limiter/core');
const { checkRateLimitStatus, subjectSegment } = await import('#/middlewares/rate-limiter/helpers');
const { appErrorHandler } = await import('#/lib/error');

const budget = { points: 5, duration: 60 * 60, blockDuration: 60 * 30 };

/** A route behind a fresh limiter in `mode`, keyed by IP, whose handler answers as `answer` says. */
function guardedRoute(mode: RateLimitMode, answer: (ctx: Context<Env>) => Response, limits = budget) {
  const limiter = rateLimiter(mode, `tier_${nanoid(8)}`, ['ip'], { limits });
  const app = new Hono<Env>();
  app.onError(appErrorHandler);
  app.post('/attempt', limiter, answer);
  const attempt = (ip: string) => app.request('http://localhost/attempt', { method: 'POST', headers: { 'x-forwarded-for': ip } });
  return { limiter, attempt };
}

const json = (status: 200 | 401) => (ctx: Context<Env>) => ctx.json({}, status);
const randomIp = () => `203.0.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;

/** The attempts each of the limiter's buckets holds for `key`, in the limiter's order. */
const counts = (limiter: RateLimiterHandler, key: string) =>
  Promise.all(limiter.buckets.map(async ({ store }) => (await store.get(key))?.consumedPoints ?? 0));

describe('the buckets a failure budget counts in', () => {
  it('counts a failure once in the hourly bucket and once in the 24-hour bucket, under the normalized key', async () => {
    for (const mode of ['fail', 'failseries'] as const) {
      const route = guardedRoute(mode, json(401));

      await route.attempt('1.2.3.4');
      expect(await counts(route.limiter, subjectSegment('ip', '1.2.3.4')), mode).toEqual([1, 1]);
      expect(memoryStores.has(`${route.limiter.keyPrefix}:slow`), mode).toBe(true);

      // Two addresses inside one /64 share both buckets.
      for (const ip of ['2001:db8:aaaa:bbbb::1', '2001:db8:aaaa:bbbb:ffff:0:0:2']) await route.attempt(ip);
      expect(await counts(route.limiter, subjectSegment('ip', '2001:db8:aaaa:bbbb::1')), mode).toEqual([2, 2]);
    }
  });

  it('must not open a 24-hour bucket for a limit or success budget', async () => {
    for (const mode of ['limit', 'success'] as const) {
      const route = guardedRoute(mode, json(200));
      await route.attempt('1.2.3.4');

      expect(route.limiter.buckets, mode).toHaveLength(1);
      expect(memoryStores.has(`${route.limiter.keyPrefix}:slow`), mode).toBe(false);
    }
  });

  it("ends a failure series on a success and keeps a fail budget's failures; the 24-hour bucket keeps them all", async () => {
    for (const [mode, kept] of [
      ['failseries', 0],
      ['fail', 3],
    ] as const) {
      let status: 200 | 401 = 401;
      const route = guardedRoute(mode, (ctx) => ctx.json({}, status));
      const ip = randomIp();

      for (let attempt = 0; attempt < 3; attempt++) await route.attempt(ip);
      status = 200;
      expect((await route.attempt(ip)).status, mode).toBe(200);

      expect(await counts(route.limiter, subjectSegment('ip', ip)), mode).toEqual([kept, 3]);
    }
  });

  it('must not let a series broken up by successes past the 24-hour budget', async () => {
    let status: 200 | 401 = 401;
    const route = guardedRoute('failseries', (ctx) => ctx.json({}, status));
    const ip = randomIp();

    // Four failures, then a success that ends the hourly series, 24 times over; then the day's last four failures.
    for (let round = 0; round < 24; round++) {
      status = 401;
      for (let attempt = 0; attempt < 4; attempt++) expect((await route.attempt(ip)).status).toBe(401);
      status = 200;
      expect((await route.attempt(ip)).status).toBe(200);
    }
    status = 401;
    for (let attempt = 0; attempt < 4; attempt++) expect((await route.attempt(ip)).status).toBe(401);

    status = 200;
    const refused = await route.attempt(ip);
    expect(refused.status).toBe(429);
    // Blocked for the 24-hour bucket's three hours while the hourly budget has room; that bucket gave the attempt back.
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(3 * 60 * 60 - 60);
    expect(await counts(route.limiter, subjectSegment('ip', ip))).toEqual([4, 100]);
  });

  it('must not answer 500 via a bucket whose store fails; the attempt goes uncounted there', async () => {
    const route = guardedRoute('failseries', json(401));
    const ip = randomIp();
    const [hourly] = route.limiter.buckets;
    vi.spyOn(hourly.store, 'penalty').mockRejectedValueOnce(new Error('store unavailable'));

    expect((await route.attempt(ip)).status).toBe(401);
    expect(await counts(route.limiter, subjectSegment('ip', ip))).toEqual([0, 1]);
  });
});

/**
 * Token links (invitations, magic links, unsubscribe) answer a failure with a redirect to the error page, so the
 * response status is 302 whatever went wrong. The failure budget must still see the failure, or a token can be guessed
 * without limit.
 */
describe('rate limiter outcome behind a redirecting error', () => {
  it('must not let token guesses go uncounted via an error answered with a redirect', async () => {
    const route = guardedRoute('failseries', () => {
      throw new AppError(401, 'invalid_token', 'warn', { willRedirect: true, meta: { errorPagePath: '/auth/error' } });
    });
    const ip = randomIp();

    const res = await route.attempt(ip);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/auth/error?error=invalid_token');
    expect(await counts(route.limiter, subjectSegment('ip', ip))).toEqual([1, 1]);
  });

  it('counts a failure answered as JSON the same way (positive control)', async () => {
    const route = guardedRoute('failseries', () => {
      throw new AppError(404, 'not_found', 'warn');
    });
    const ip = randomIp();

    expect((await route.attempt(ip)).status).toBe(404);
    expect(await counts(route.limiter, subjectSegment('ip', ip))).toEqual([1, 1]);
  });

  it('leaves a successful redirect uncounted', async () => {
    const route = guardedRoute('failseries', (ctx) => ctx.redirect('http://localhost:3000/auth/authenticate', 302));
    const ip = randomIp();

    expect((await route.attempt(ip)).status).toBe(302);
    expect(await counts(route.limiter, subjectSegment('ip', ip))).toEqual([0, 0]);
  });
});

describe('rate limit status', () => {
  it('must not report a blocked failure budget as open', async () => {
    const route = guardedRoute('failseries', json(401));
    const ip = randomIp();
    for (let attempt = 0; attempt <= budget.points; attempt++) await route.attempt(ip);
    expect((await route.attempt(ip)).status).toBe(429);

    const status = await checkRateLimitStatus(route.limiter, subjectSegment('ip', ip));
    expect(status.isLimited).toBe(true);
    expect(status.retryAfter).toBeGreaterThan(0);
    expect(status.retryAfter).toBeLessThanOrEqual(budget.blockDuration);
  });

  it('reports a limit budget at its points as limited, reading only the bucket it counts in', async () => {
    const route = guardedRoute('limit', json(200), { points: 3, duration: 60 * 60, blockDuration: 60 });
    const ip = randomIp();
    for (let attempt = 0; attempt < 3; attempt++) expect((await route.attempt(ip)).status).toBe(200);

    expect((await checkRateLimitStatus(route.limiter, subjectSegment('ip', ip))).isLimited).toBe(true);
    expect(memoryStores.has(`${route.limiter.keyPrefix}:slow`)).toBe(false);
    // What the status announced: the next request is refused.
    expect((await route.attempt(ip)).status).toBe(429);
  });
});
