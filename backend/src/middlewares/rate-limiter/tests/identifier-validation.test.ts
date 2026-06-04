import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '#/core/error';

// Undo setup.ts mock — this test needs the real rateLimiter to exercise identifier validation
vi.unmock('#/middlewares/rate-limiter/core');

// Mock the helpers module to isolate identifier extraction from DB/limiter internals
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) => {
  const original = await importOriginal<typeof import('#/middlewares/rate-limiter/helpers')>();
  return {
    ...original,
    // Return a no-op limiter that never blocks (we only care about identifier validation)
    getRateLimiterInstance: () => ({
      get: vi.fn().mockResolvedValue(null),
      consume: vi.fn().mockResolvedValue({ consumedPoints: 1, remainingPoints: 9, msBeforeNext: 0 }),
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
 */
function createTestApp(middleware: ReturnType<typeof rateLimiter>) {
  const app = new Hono();
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.type }, err.status as 400);
    return c.json({ error: 'internal' }, 500);
  });
  app.post('/test', middleware, (c) => c.text('ok'));
  return app;
}

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
});
