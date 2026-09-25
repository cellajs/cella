import { type Context, Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';

// Undo setup.ts mock: this test drives the REAL tokenLimiter behind the real error handler.
vi.unmock('#/middlewares/rate-limiter/core');

const { consumeSpy, deleteSpy } = vi.hoisted(() => ({
  consumeSpy: vi.fn().mockResolvedValue({ consumedPoints: 1, remainingPoints: 9, msBeforeNext: 0 }),
  deleteSpy: vi.fn().mockResolvedValue(true),
}));

vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) => {
  const original = await importOriginal<typeof import('#/middlewares/rate-limiter/helpers')>();
  return {
    ...original,
    getRateLimiterInstance: () => ({
      points: 10,
      get: vi.fn(async () => null),
      consume: consumeSpy,
      delete: deleteSpy,
    }),
  };
});

const { tokenLimiter } = await import('#/middlewares/rate-limiter/limiters');
const { appErrorHandler } = await import('#/lib/error');

/** A token route behind the failure-series limiter, whose handler answers with `answer`. */
function tokenRoute(answer: (ctx: Context<Env>) => Response) {
  const app = new Hono<Env>();
  app.onError(appErrorHandler);
  app.get('/token/:token', tokenLimiter('token'), (ctx) => answer(ctx));
  return app;
}

const request = (app: Hono<Env>) =>
  app.request('http://localhost/token/guess', { headers: { 'x-forwarded-for': '1.2.3.4' } });

/**
 * Token links (invitations, magic links, unsubscribe) answer a failure with a redirect to the error page, so the
 * response status is 302 whatever went wrong. The failure-series limiter must still see the failure, or a token can be
 * guessed without limit.
 */
describe('rate limiter outcome behind a redirecting error', () => {
  beforeEach(() => {
    consumeSpy.mockClear();
    deleteSpy.mockClear();
  });

  it('must not let token guesses go uncounted via an error answered with a redirect', async () => {
    const res = await request(
      tokenRoute(() => {
        throw new AppError(401, 'invalid_token', 'warn', {
          willRedirect: true,
          meta: { errorPagePath: '/auth/error' },
        });
      }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/auth/error?error=invalid_token');
    // One point in the 24-hour bucket and one in the failure series.
    expect(consumeSpy).toHaveBeenCalledTimes(2);
    expect(consumeSpy).toHaveBeenCalledWith('ip:1.2.3.4');
  });

  it('counts a failure answered as JSON the same way (positive control)', async () => {
    const res = await request(
      tokenRoute(() => {
        throw new AppError(404, 'not_found', 'warn');
      }),
    );

    expect(res.status).toBe(404);
    expect(consumeSpy).toHaveBeenCalledTimes(2);
  });

  it('leaves a successful redirect uncounted', async () => {
    const res = await request(tokenRoute((ctx) => ctx.redirect('http://localhost:3000/auth/authenticate', 302)));

    expect(res.status).toBe(302);
    expect(consumeSpy).not.toHaveBeenCalled();
  });
});
