import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { memoryStores } from './memory-stores';

// Undo the setup.ts mock: these tests drive the real middleware against in-memory stores, end to end
vi.unmock('#/middlewares/rate-limiter/core');
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) => (await import('./memory-stores')).memoryStoresMock(importOriginal));

// Must import AFTER mocks are set up
const { rateLimiter } = await import('#/middlewares/rate-limiter/core');
const { getRetryAfter } = await import('#/middlewares/rate-limiter/helpers');
const { clearCache } = await import('#/middlewares/rate-limiter/points-cache');

/** App mimicking pointsLimiter: static ceiling, dynamic per-tenant budget. */
function buildApp(key: string, tenantId: string, ceiling: number, budget: () => number) {
  const limiter = rateLimiter('limit', key, ['tenantId'], {
    limits: { points: ceiling, duration: 60 * 60, blockDuration: 0 },
    getPointsBudget: budget,
  });
  const app = new Hono<Env>();
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.type }, err.status as 429);
    return c.json({ error: 'internal' }, 500);
  });
  app.use(async (c, next) => {
    c.set('tenantId', tenantId);
    await next();
  });
  app.post('/t', limiter, (c) => c.json({ ok: true }, 200));
  return app;
}

async function hammer(app: Hono<Env>, n: number) {
  let allowed = 0;
  let blocked = 0;
  for (let i = 0; i < n; i++) {
    const res = await app.request('http://localhost/t', { method: 'POST' });
    if (res.status === 200) allowed++;
    else if (res.status === 429) blocked++;
    else throw new Error(`unexpected status ${res.status}`);
  }
  return { allowed, blocked };
}

describe('points budget enforcement (end to end)', () => {
  beforeEach(() => {
    clearCache();
    memoryStores.clear();
  });

  it('enforces the tenant budget exactly, including requests served by the fast path', async () => {
    const app = buildApp('budget', 't1', 5000, () => 1000);

    const { allowed, blocked } = await hammer(app, 1200);

    expect(allowed).toBe(1000);
    expect(blocked).toBe(200);
  });

  it('settles every fast-path consume into the DB', async () => {
    const app = buildApp('settle', 't1', 5000, () => 100);
    await hammer(app, 90);

    const state = await memoryStores.get('settle_limit')!.get('tenantId:t1');
    // The DB must contain all 90 requests: 79 from the fast path and 11 from the DB path.
    expect(state?.consumedPoints).toBe(90);
  });

  describe('a pace counted in process, without a tenant budget', () => {
    /** The sync-read limiter's shape, scaled down: a five-minute window, no block, counted in process. */
    function buildPacedApp(key: string) {
      const limiter = rateLimiter('limit', key, ['tenantId'], {
        limits: { points: 100, duration: 60 * 5, blockDuration: 0 },
        countsInProcess: true,
      });
      const app = new Hono<Env>();
      app.onError((err, c) => (err instanceof AppError ? c.json({ error: err.type }, err.status as 429) : c.json({ error: 'internal' }, 500)));
      app.use(async (c, next) => {
        c.set('tenantId', 't1');
        await next();
      });
      app.post('/t', limiter, (c) => c.json({ ok: true }, 200));
      return app;
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it('enforces the limit exactly', async () => {
      const app = buildPacedApp('reads');

      const { allowed, blocked } = await hammer(app, 130);

      expect(allowed).toBe(100);
      expect(blocked).toBe(30);
      // The first 79 requests never reached the store; the 80th settled them with its own.
      expect((await memoryStores.get('reads_limit')!.get('tenantId:t1'))?.consumedPoints).toBeGreaterThanOrEqual(100);
    });

    it('must not hand out a second budget inside the window', async () => {
      vi.useFakeTimers();
      const start = Date.now();
      const app = buildPacedApp('paced');

      expect((await hammer(app, 130)).allowed).toBe(100);

      // Spent in the window's first second: nothing more until the window ends.
      for (const minute of [1, 3, 4.9]) {
        vi.setSystemTime(start + minute * 60 * 1000);
        expect((await hammer(app, 20)).allowed, `minute ${minute}`).toBe(0);
      }
    });

    it('brings the budget back when the window ends (positive control)', async () => {
      vi.useFakeTimers();
      const app = buildPacedApp('restart');

      expect((await hammer(app, 130)).allowed).toBe(100);

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
      expect((await hammer(app, 130)).allowed).toBe(100);
    });

    it('refuses in-process counting for a window longer than an hour, which the counter would drop an idle key inside', () => {
      const daily = { points: 10, duration: 60 * 60 * 24, blockDuration: 0 };
      expect(() => rateLimiter('limit', 'daily', ['tenantId'], { limits: daily, countsInProcess: true })).toThrow('at most an hour');
      expect(() => rateLimiter('limit', 'dailyBudget', ['tenantId'], { limits: daily, getPointsBudget: () => 5 })).toThrow('at most an hour');
    });
  });

  it('clamps tenant budgets to the static ceiling', async () => {
    const app = buildApp('clamp', 't1', 100, () => 1_000_000);

    const { allowed } = await hammer(app, 150);

    expect(allowed).toBe(100);
  });

  it('treats budget 0 as "no tenant limit" bounded by the ceiling, not as lockout', async () => {
    // Budget 0 documents "no tenant limit", so the ceiling is the only bound
    const app = buildApp('zero', 't1', 50, () => 0);

    const { allowed, blocked } = await hammer(app, 60);

    expect(allowed).toBe(50);
    expect(blocked).toBe(10);
  });

  it('never mutates the shared limiter instance across tenants', async () => {
    // The same limiter key and mode share one memoized instance across every tenant
    const CEILING = 5000;
    let budget = 10;
    const small = buildApp('shared', 'small', CEILING, () => budget);
    const big = buildApp('shared', 'big', CEILING, () => 1000);

    await hammer(small, 12); // exhaust the small tenant's budget of 10

    const instance = memoryStores.get('shared_limit')!;
    expect(instance.points).toBe(CEILING);

    // Big tenant's traffic must not unblock the small tenant...
    const { allowed: bigAllowed } = await hammer(big, 5);
    expect(bigAllowed).toBe(5);
    expect(instance.points).toBe(CEILING);

    // ...the small tenant stays measured against ITS budget.
    const res = await small.request('http://localhost/t', { method: 'POST' });
    expect(res.status).toBe(429);

    // 11 points are already consumed (the 11th consumed before being rejected), so 9 remain of the new budget of 20
    budget = 20;
    const { allowed: smallAllowedAfterRaise } = await hammer(small, 20);
    expect(smallAllowedAfterRaise).toBe(9);
  });

  it('floors Retry-After at one second, so a sub-second wait never reads as "retry now"', () => {
    expect(getRetryAfter(0)).toBe('1');
    expect(getRetryAfter(400)).toBe('1');
    expect(getRetryAfter(1500)).toBe('2');
  });
});

/**
 * The store replaces what is left of a `limit` window with its block. A block shorter than the window therefore ends
 * inside it and hands out a whole budget again: 100 an hour with a five-minute block accepts 400 in that hour.
 */
describe('the windows of the limit limiters', () => {
  it('must not hand out a second budget inside a window via a block shorter than it', async () => {
    const limiters = await import('#/middlewares/rate-limiter/limiters');
    const limits = Object.entries(limiters).flatMap(([name, limiter]) =>
      'keyPrefix' in limiter && limiter.keyPrefix.endsWith('_limit') ? [{ name, ...limiter.buckets[0].limits }] : [],
    );

    // Every route limiter that counts each request is read (positive control).
    expect(limits.map(({ name }) => name)).toEqual(expect.arrayContaining(['emailEnumLimiter', 'syncReadLimiter', 'yjsHttpLimiter']));
    expect(limits.filter(({ duration, blockDuration }) => blockDuration > 0 && blockDuration < duration)).toEqual([]);
  });
});
