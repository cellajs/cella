import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import { getAdminDb } from '#/db/db';
import type { RateLimitMode } from '#/middlewares/rate-limiter/types';
import { rateLimitsTable } from '#/modules/auth/rate-limits-db';

// Undo the setup.ts mock: these tests drive the real middleware against the real database store.
vi.unmock('#/middlewares/rate-limiter/core');

const { rateLimiter } = await import('#/middlewares/rate-limiter/core');
const { appErrorHandler } = await import('#/lib/error');

const budget = { points: 5, duration: 60 * 60, blockDuration: 60 * 30 };

/** How the handler answers: a JSON status, a sign-in's 204 or an OAuth callback's redirect. */
type Answer = 200 | 204 | 302 | 400 | 401;

/**
 * A route behind a fresh limiter whose handler counts its runs and answers with `status`, or 401 at once for a request
 * sent with `failFast`.
 */
function guardedRoute(mode: RateLimitMode, status: Answer, limits: typeof budget = budget) {
  const limiter = rateLimiter(mode, `burst_${nanoid(8)}`, ['ip'], { limits });
  const app = new Hono<Env>();
  app.onError(appErrorHandler);
  let reached = 0;
  app.post('/attempt', limiter, async (ctx) => {
    reached++;
    if (ctx.req.header('x-fail-fast')) return ctx.json({}, 401);
    // The handler's own work (verifying a code, reading a token), which the rest of the burst overlaps.
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (status === 302) return ctx.redirect('http://localhost/app', 302);
    if (status === 204) return ctx.body(null, 204);
    return ctx.json({}, status);
  });
  const attempt = async (ip: string, { failFast = false } = {}) =>
    app.request('http://localhost/attempt', {
      method: 'POST',
      headers: { 'x-forwarded-for': ip, ...(failFast && { 'x-fail-fast': '1' }) },
    });
  return { limiter, attempt, reached: () => reached };
}

const randomIp = () => `203.0.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
const burst = async (attempt: (ip: string) => Response | Promise<Response>, ip: string, size: number) =>
  (await Promise.all(Array.from({ length: size }, () => attempt(ip)))).map((response) => response.status);

/** The bucket's row for `ip`, read past RLS. */
const bucketOf = async (limiter: { keyPrefix: string }, ip: string) => {
  const [row] = await getAdminDb('rate limit test')
    .select()
    .from(rateLimitsTable)
    .where(eq(rateLimitsTable.key, `${limiter.keyPrefix}:ip:${ip}`));
  return row;
};

/**
 * A fail-mode budget (TOTP codes, token links, address probes) must hold against a parallel burst, not only against
 * requests sent one after another: every request of a burst passes a check that runs before any failure is recorded.
 */
describe('fail-mode budgets under a parallel burst', () => {
  it('must not let a parallel burst past a failure budget via checks that run before the handler', async () => {
    for (const mode of ['failseries', 'fail'] as const) {
      const route = guardedRoute(mode, 401);

      const statuses = await burst(route.attempt, randomIp(), 20);

      expect(route.reached(), mode).toBeLessThanOrEqual(budget.points);
      expect(statuses.filter((status) => status === 401).length, mode).toBe(route.reached());
      expect(statuses.filter((status) => status === 429).length, mode).toBe(20 - route.reached());
    }
  });

  it('blocks the key in the database for the block duration once the budget is spent', async () => {
    const route = guardedRoute('failseries', 401);
    const ip = randomIp();

    for (let attempt = 0; attempt < budget.points; attempt++) expect((await route.attempt(ip)).status).toBe(401);

    const refused = await route.attempt(ip);
    expect(refused.status).toBe(429);
    // Every process reads the same block, and the lockout mail announces the same length.
    const row = await bucketOf(route.limiter, ip);
    const blockSeconds = ((row?.expire?.getTime() ?? 0) - Date.now()) / 1000;
    expect(blockSeconds).toBeGreaterThan(budget.blockDuration - 60);
    expect(blockSeconds).toBeLessThanOrEqual(budget.blockDuration);
    expect(Number(refused.headers.get('retry-after'))).toBeLessThanOrEqual(budget.blockDuration);
  });

  it('must not keep a key blocked in this process after its block ended in the database', async () => {
    const route = guardedRoute('failseries', 401);
    const ip = randomIp();
    for (let attempt = 0; attempt <= budget.points; attempt++) await route.attempt(ip);

    // The block runs out, as it does for every other process reading the database.
    await getAdminDb('rate limit test')
      .update(rateLimitsTable)
      .set({ expire: new Date(Date.now() - 1000) })
      .where(eq(rateLimitsTable.key, `${route.limiter.keyPrefix}:ip:${ip}`));

    // A fresh budget: the process holds no block of its own that outlives the one in the database.
    const statuses: number[] = [];
    for (let attempt = 0; attempt <= budget.points; attempt++) statuses.push((await route.attempt(ip)).status);
    expect(statuses).toEqual([...Array(budget.points).fill(401), 429]);
  });

  it('counts no successful attempt against the budget (positive control)', async () => {
    for (const mode of ['failseries', 'fail'] as const) {
      const succeeding = guardedRoute(mode, 200);
      const ip = randomIp();

      // More successes than the budget, sent one after another, and a burst of successes within the budget.
      for (let attempt = 0; attempt < 12; attempt++) expect((await succeeding.attempt(ip)).status, mode).toBe(200);
      expect(await burst(succeeding.attempt, ip, budget.points), mode).toEqual(Array(budget.points).fill(200));
      expect(succeeding.reached(), mode).toBe(12 + budget.points);

      // The failure budget is still whole on that key: a success resets a series, and gives its attempt back otherwise.
      expect((await bucketOf(succeeding.limiter, ip))?.points ?? 0, mode).toBe(0);
    }
  });
});

/**
 * The other modes hold a budget of sends (magic links per address, emails per user) that a parallel burst must not
 * pass either: `limit` counts before the handler, `success` counted only after it.
 */
describe('send budgets under a parallel burst', () => {
  it('must not send more than a limit budget via a parallel burst on a new key', async () => {
    // The magic-link limiter's shape: two per address per window.
    const route = guardedRoute('limit', 200, { points: 2, duration: 60 * 30, blockDuration: 0 });

    const statuses = await burst(route.attempt, randomIp(), 20);

    expect(route.reached()).toBe(2);
    expect(statuses.filter((status) => status === 429)).toHaveLength(18);
  });

  it('must not send more than a success budget via a parallel burst', async () => {
    // The email spam limiter's shape: ten successful sends per hour.
    const route = guardedRoute('success', 200, { points: 10, duration: 60 * 60, blockDuration: 60 * 30 });

    const statuses = await burst(route.attempt, randomIp(), 20);

    expect(route.reached()).toBe(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(10);
  });

  it('counts only successful sends against a success budget (positive control)', async () => {
    const failing = guardedRoute('success', 401, { points: 10, duration: 60 * 60, blockDuration: 60 * 30 });
    const ip = randomIp();

    const statuses = await burst(failing.attempt, ip, 10);
    for (let attempt = 0; attempt < 5; attempt++) statuses.push((await failing.attempt(ip)).status);

    expect(statuses).toEqual(Array(15).fill(401));
    expect((await bucketOf(failing.limiter, ip))?.points ?? 0).toBe(0);
  });
});

/**
 * An attempt counted before the handler runs must never lock anyone out by itself: a burst past the budget is refused
 * while it is in flight, and once it is answered only the outcomes the bucket counts remain.
 */
describe('a parallel burst past the budget', () => {
  it('must not lock a client out via a parallel burst of successes past a failure budget', async () => {
    // OAuth callbacks answer a success with a redirect and passkey sign-ins with 204, which a series neither counts nor
    // resets; `fail` gives a success back.
    for (const [mode, answer] of [
      ['failseries', 302],
      ['failseries', 204],
      ['fail', 200],
    ] as const) {
      const route = guardedRoute(mode, answer);
      const ip = randomIp();

      const statuses = await burst(route.attempt, ip, budget.points + 5);
      // The burst outran the budget while it was in flight...
      expect(statuses, `${mode} ${answer}`).toContain(429);
      expect(route.reached(), `${mode} ${answer}`).toBeLessThanOrEqual(budget.points);

      // ...and nothing failed: the next request passes, and the bucket holds nothing.
      expect((await route.attempt(ip)).status, `${mode} ${answer}`).toBe(answer);
      expect((await bucketOf(route.limiter, ip))?.points ?? 0, `${mode} ${answer}`).toBe(0);
    }
  });

  it('must not lock a sender out via a parallel burst of failed sends past a success budget', async () => {
    // The email spam limiter's shape: ten successful sends per hour, here every one refused by validation.
    const route = guardedRoute('success', 400, { points: 10, duration: 60 * 60, blockDuration: 60 * 30 });
    const ip = randomIp();

    const statuses = await burst(route.attempt, ip, 15);
    expect(statuses).toContain(429);

    expect((await route.attempt(ip)).status).toBe(400);
    expect((await bucketOf(route.limiter, ip))?.points ?? 0).toBe(0);
  });

  it('must not block a key via one failure answered while successes fill the budget', async () => {
    const route = guardedRoute('fail', 200);
    const ip = randomIp();

    // One quick failure among slower successes that hold the rest of the budget until after it is answered.
    const statuses = await Promise.all([
      route.attempt(ip, { failFast: true }).then((response) => response.status),
      ...Array.from({ length: budget.points - 1 }, () => route.attempt(ip).then((response) => response.status)),
    ]);
    expect(statuses).toEqual([401, ...Array(budget.points - 1).fill(200)]);

    // One failure of five: the key takes more attempts, and the failure stays counted.
    expect((await route.attempt(ip)).status).toBe(200);
    expect((await bucketOf(route.limiter, ip))?.points).toBe(1);
  });

  it('still blocks the key after a parallel burst of failures past the budget (positive control)', async () => {
    for (const mode of ['failseries', 'fail'] as const) {
      const route = guardedRoute(mode, 401);
      const ip = randomIp();

      const statuses = await burst(route.attempt, ip, budget.points + 5);
      expect(statuses.filter((status) => status === 401).length, mode).toBe(budget.points);
      expect(statuses.filter((status) => status === 429).length, mode).toBe(5);

      const refused = await route.attempt(ip);
      expect(refused.status, mode).toBe(429);
      // Blocked from the last failure for the block duration, in every process alike.
      const blockSeconds = (((await bucketOf(route.limiter, ip))?.expire?.getTime() ?? 0) - Date.now()) / 1000;
      expect(blockSeconds, mode).toBeGreaterThan(budget.blockDuration - 60);
      expect(blockSeconds, mode).toBeLessThanOrEqual(budget.blockDuration);
    }
  });

  it('still refuses a sender whose successful sends spent the budget (positive control)', async () => {
    const route = guardedRoute('success', 200, { points: 10, duration: 60 * 60, blockDuration: 60 * 30 });
    const ip = randomIp();

    expect(await burst(route.attempt, ip, 15)).toContain(429);
    expect((await route.attempt(ip)).status).toBe(429);
  });
});
