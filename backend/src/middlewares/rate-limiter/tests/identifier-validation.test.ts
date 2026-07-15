import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';

// Undo setup.ts mock: this test needs the real rateLimiter to exercise identifier validation.
vi.unmock('#/middlewares/rate-limiter/core');

// Shared consume spy so tests can observe the generated rate limit key
const { consumeSpy } = vi.hoisted(() => ({
  consumeSpy: vi.fn().mockResolvedValue({ consumedPoints: 1, remainingPoints: 9, msBeforeNext: 0 }),
}));

// Mock the helpers module to isolate identifier extraction from DB/limiter internals
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) => {
  const original = await importOriginal<typeof import('#/middlewares/rate-limiter/helpers')>();
  return {
    ...original,
    // Return a no-op limiter that never blocks (we only care about key generation/validation)
    getRateLimiterInstance: () => ({
      get: vi.fn().mockResolvedValue(null),
      consume: consumeSpy,
      points: 10,
    }),
  };
});

// Must import AFTER mocks are set up
const { rateLimiter } = await import('#/middlewares/rate-limiter/core');

/** Helper to build a POST Request with proper content-length */
function jsonRequest(path: string, body: Record<string, unknown>) {
  const json = JSON.stringify(body);
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(json.length) },
    body: json,
  });
}

/**
 * Creates a minimal Hono test app with error handling that applies
 * the given rate limiter middleware before a simple 200 handler.
 * Pass `userId` to simulate an authenticated request (authGuard runs before limiters).
 */
function createTestApp(middleware: ReturnType<typeof rateLimiter>, userId?: string) {
  const app = new Hono<Env>();
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.type }, err.status as 400);
    return c.json({ error: 'internal' }, 500);
  });
  if (userId) {
    app.use(async (c, next) => {
      // Mirror authGuard, which sets both `user` and `userId`
      c.set('user', { id: userId } as Env['Variables']['user']);
      c.set('userId', userId);
      await next();
    });
  }
  app.post('/test', middleware, (c) => c.text('ok'));
  return app;
}

/** Fake node-server bindings so getIp's socket fallback resolves to null instead of crashing */
const emptyBindings = { incoming: { socket: {} } } as Env['Bindings'];

describe('rate limiter identifier validation', () => {
  describe('email identifier', () => {
    const limiter = rateLimiter('limit', 'test', ['email'], {
      limits: { points: 10, duration: 60 },
    });
    const app = createTestApp(limiter);

    it('should reject when email is missing from body', async () => {
      const res = await app.request(jsonRequest('/test', { name: 'no-email' }));
      expect(res.status).toBe(400);
    });

    it('should reject when body has no email field', async () => {
      const res = await app.request(jsonRequest('/test', {}));
      expect(res.status).toBe(400);
    });

    it('should allow request when email is present in body', async () => {
      const res = await app.request(jsonRequest('/test', { email: 'test@example.com' }));
      expect(res.status).toBe(200);
    });

    it('should reject when email is only in query (not body)', async () => {
      const res = await app.request(new Request('http://localhost/test?email=test@example.com', { method: 'POST' }));
      expect(res.status).toBe(400);
    });
  });

  describe('fallback chain identifier', () => {
    const limiter = () =>
      rateLimiter('limit', 'chainTest', [['userId', 'ip']], {
        limits: { points: 10, duration: 60 },
      });

    beforeEach(() => consumeSpy.mockClear());

    it('should key per user when authenticated, ignoring IP', async () => {
      const app = createTestApp(limiter(), 'user-1');
      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.2.3.4' },
      });
      const res = await app.request(req, undefined, emptyBindings);
      expect(res.status).toBe(200);
      expect(consumeSpy).toHaveBeenCalledWith('userId:user-1', 1);
    });

    it('should fall back to IP for anonymous requests', async () => {
      const app = createTestApp(limiter());
      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.2.3.4' },
      });
      const res = await app.request(req, undefined, emptyBindings);
      expect(res.status).toBe(200);
      expect(consumeSpy).toHaveBeenCalledWith('ip:1.2.3.4', 1);
    });

    it('should reject when no identifier in the chain resolves', async () => {
      const app = createTestApp(limiter());
      const res = await app.request(new Request('http://localhost/test', { method: 'POST' }), undefined, emptyBindings);
      expect(res.status).toBe(400);
      expect(consumeSpy).not.toHaveBeenCalled();
    });
  });

  describe('empty key guard', () => {
    it('should reject when the key resolves empty (userId limiter on anonymous request)', async () => {
      const limiter = rateLimiter('limit', 'emptyKeyTest', ['userId'], {
        limits: { points: 10, duration: 60 },
      });
      const app = createTestApp(limiter);
      const res = await app.request(new Request('http://localhost/test', { method: 'POST' }), undefined, emptyBindings);
      expect(res.status).toBe(400);
    });

    it('should allow when the optional identifier resolves', async () => {
      const limiter = rateLimiter('limit', 'emptyKeyTest2', ['userId'], {
        limits: { points: 10, duration: 60 },
      });
      const app = createTestApp(limiter, 'user-2');
      const res = await app.request(new Request('http://localhost/test', { method: 'POST' }), undefined, emptyBindings);
      expect(res.status).toBe(200);
    });
  });
});
