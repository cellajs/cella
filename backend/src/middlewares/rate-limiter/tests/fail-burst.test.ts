import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import { getAdminDb } from '#/db/db';
import { rateLimitsTable } from '#/modules/auth/rate-limits-db';

// Undo the setup.ts mock: these tests drive the real middleware against the real database store.
vi.unmock('#/middlewares/rate-limiter/core');

const { rateLimiter } = await import('#/middlewares/rate-limiter/core');
const { appErrorHandler } = await import('#/lib/error');

const budget = { points: 5, duration: 60 * 60, blockDuration: 60 * 30 };

/** A route behind a fresh fail-mode limiter whose handler counts its runs and answers with `status`. */
function guardedRoute(mode: 'fail' | 'failseries', status: 200 | 401) {
  const limiter = rateLimiter(mode, `burst_${nanoid(8)}`, ['ip'], { limits: budget });
  const app = new Hono<Env>();
  app.onError(appErrorHandler);
  let reached = 0;
  app.post('/attempt', limiter, async (ctx) => {
    reached++;
    // The handler's own work (verifying a code, reading a token), which the rest of the burst overlaps.
    await new Promise((resolve) => setTimeout(resolve, 25));
    return ctx.json({}, status);
  });
  const attempt = (ip: string) =>
    app.request('http://localhost/attempt', { method: 'POST', headers: { 'x-forwarded-for': ip } });
  return { limiter, attempt, reached: () => reached };
}

const randomIp = () => `203.0.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
const burst = async (attempt: (ip: string) => Response | Promise<Response>, ip: string, size: number) =>
  (await Promise.all(Array.from({ length: size }, () => attempt(ip)))).map((response) => response.status);

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
    const [row] = await getAdminDb('rate limit test')
      .select()
      .from(rateLimitsTable)
      .where(eq(rateLimitsTable.key, `${route.limiter.keyPrefix}:ip:${ip}`));
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
      const [row] = await getAdminDb('rate limit test')
        .select()
        .from(rateLimitsTable)
        .where(eq(rateLimitsTable.key, `${succeeding.limiter.keyPrefix}:ip:${ip}`));
      expect(row?.points ?? 0, mode).toBe(0);
    }
  });
});
