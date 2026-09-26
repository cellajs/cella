import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';

// Undo the setup.ts mock: these tests charge the real middleware against the real database store.
vi.unmock('#/middlewares/rate-limiter/core');

const { rateLimiter } = await import('#/middlewares/rate-limiter/core');
const { chargeLimiter, limiterScope } = await import('#/middlewares/rate-limiter/helpers');
const { appErrorHandler } = await import('#/lib/error');

const randomIp = () => `203.0.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
const workLimiter = () =>
  rateLimiter('limit', `scope_${nanoid(8)}`, ['ip'], { limits: { points: 3, duration: 60, blockDuration: 60 } });

/** A limiter charged where the work it bounds starts, from code that has no request context of its own. */
describe('limiter scope', () => {
  it('charges a bound request for the work it does, never for the request itself', async () => {
    const limiter = workLimiter();
    const app = new Hono<Env>();
    app.onError(appErrorHandler);
    app.use(limiterScope);
    app.post('/work', async (ctx) => {
      // The library call that does the work, with the charge at its start.
      const doWork = async () => void (await chargeLimiter(limiter));
      for (let unit = 0; unit < Number(ctx.req.query('units')); unit++) await doWork();
      return ctx.json({}, 200);
    });
    const send = (ip: string, units: number) =>
      app.request(`http://localhost/work?units=${units}`, { method: 'POST', headers: { 'x-forwarded-for': ip } });
    const ip = randomIp();

    for (let request = 0; request < 5; request++) expect((await send(ip, 0)).status).toBe(200);
    expect((await send(ip, 3)).status).toBe(200);

    const refused = await send(ip, 1);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBeTruthy();
    // Positive control: the budget is per address.
    expect((await send(randomIp(), 1)).status).toBe(200);
  });

  it('refuses to charge outside a bound request, so the caller can refuse the work', async () => {
    expect(await chargeLimiter(workLimiter())).toBe(false);
  });
});
