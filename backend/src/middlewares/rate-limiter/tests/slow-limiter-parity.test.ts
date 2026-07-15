import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

// Undo setup.ts mock: this test needs the real rateLimiter to exercise the slow-limiter path.
vi.unmock('#/middlewares/rate-limiter/core');

// Record the keys each limiter instance is called with, so we can assert get/consume parity.
const slowCalls = { get: [] as string[], consume: [] as string[] };
const fastCalls = { get: [] as string[], consume: [] as string[] };

// Mock only the limiter factory; keep the real extractIdentifiers/rateLimitError so key derivation
// (getIp → `ip:<normalized>`) runs exactly as in production.
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) => {
  const original = await importOriginal<typeof import('#/middlewares/rate-limiter/helpers')>();
  return {
    ...original,
    getRateLimiterInstance: (options: { keyPrefix: string }) => {
      const bucket = options.keyPrefix.endsWith(':slow') ? slowCalls : fastCalls;
      return {
        points: options.keyPrefix.endsWith(':slow') ? 100 : 10,
        get: vi.fn(async (key: string) => {
          bucket.get.push(key);
          return null;
        }),
        consume: vi.fn(async (key: string) => {
          bucket.consume.push(key);
          return { consumedPoints: 1, remainingPoints: 99, msBeforeNext: 0 };
        }),
        delete: vi.fn(async () => {}),
      };
    },
  };
});

// Must import AFTER mocks are set up
const { rateLimiter } = await import('#/middlewares/rate-limiter/core');

describe('slow brute-force limiter key parity (F7)', () => {
  it('consumes the slow limiter with the SAME normalized key it is checked with', async () => {
    const limiter = rateLimiter('failseries', 'testfail', ['ip'], { limits: { points: 10, duration: 60 } });
    const app = new Hono();
    // Handler returns a fail status so the failseries slow-consume branch runs.
    app.post('/test', limiter, (c) => c.json({ error: 'bad' }, 401));

    await app.request('http://localhost/test', { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' } });

    // The slow bucket was both read and written...
    expect(slowCalls.get.length).toBeGreaterThan(0);
    expect(slowCalls.consume.length).toBeGreaterThan(0);
    // ...against the exact same key (the pre-fix bug consumed an un-prefixed `1.2.3.4` while
    // reading `ip:1.2.3.4`, so the 24h bucket never accumulated and could never block).
    expect(slowCalls.consume[0]).toBe(slowCalls.get[0]);
    expect(slowCalls.get[0]).toBe('ip:1.2.3.4');
  });
});
