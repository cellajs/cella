import { Hono } from 'hono';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';

// Undo the setup.ts mock: these tests drive the real middleware against a real RateLimiterMemory, end to end
vi.unmock('#/middlewares/rate-limiter/core');

// Real in-memory limiter instances, memoized by keyPrefix exactly like production.
const instances = new Map<string, RateLimiterMemory>();

vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) => {
  const original = await importOriginal<typeof import('#/middlewares/rate-limiter/helpers')>();
  return {
    ...original,
    getRateLimiterInstance: (options: { keyPrefix: string; points: number; duration: number }) => {
      const existing = instances.get(options.keyPrefix);
      if (existing) return existing;
      const instance = new RateLimiterMemory(options);
      instances.set(options.keyPrefix, instance);
      return instance;
    },
  };
});

// Must import AFTER mocks are set up
const { rateLimiter } = await import('#/middlewares/rate-limiter/core');
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
  let lastBlockedResponse: Response | null = null;
  for (let i = 0; i < n; i++) {
    const res = await app.request('http://localhost/t', { method: 'POST' });
    if (res.status === 200) allowed++;
    else if (res.status === 429) {
      blocked++;
      lastBlockedResponse = res;
    } else throw new Error(`unexpected status ${res.status}`);
  }
  return { allowed, blocked, lastBlockedResponse };
}

describe('points budget enforcement (end to end)', () => {
  beforeEach(() => {
    clearCache();
    instances.clear();
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

    const state = await instances.get('settle_limit')!.get('tenantId:t1');
    // The DB must contain all 90 requests: 79 from the fast path and 11 from the DB path.
    expect(state?.consumedPoints).toBe(90);
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

    const instance = instances.get('shared_limit')!;
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

  it('sends a Retry-After of at least 1 second on 429', async () => {
    const app = buildApp('retry', 't1', 5, () => 5);
    const { lastBlockedResponse } = await hammer(app, 10);

    const retryAfter = Number(lastBlockedResponse!.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
  });
});
