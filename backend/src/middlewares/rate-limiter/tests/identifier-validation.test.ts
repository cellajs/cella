import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';
import type { RateLimitKeyPart } from '#/middlewares/rate-limiter/types';
import { memoryStores } from './memory-stores';

// Undo the setup.ts mock: these tests need the real rateLimiter to derive the key.
vi.unmock('#/middlewares/rate-limiter/core');
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) =>
  (await import('./memory-stores')).memoryStoresMock(importOriginal),
);

const { rateLimiter } = await import('#/middlewares/rate-limiter/core');
const { subjectSegment } = await import('#/middlewares/rate-limiter/helpers');
const { appErrorHandler } = await import('#/lib/error');

function jsonRequest(path: string, body: Record<string, unknown>) {
  const json = JSON.stringify(body);
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(json.length) },
    body: json,
  });
}

/** A route behind a fresh `limit` limiter keyed on `identifiers`; `userId` signs its requests in. */
function keyedRoute(identifiers: RateLimitKeyPart[], userId?: string) {
  const limiter = rateLimiter('limit', `key_${nanoid(8)}`, identifiers, { limits: { points: 10, duration: 60 } });
  const app = new Hono<Env>();
  app.onError(appErrorHandler);
  if (userId) {
    app.use(async (ctx, next) => {
      ctx.set('user', { id: userId } as Env['Variables']['user']);
      await next();
    });
  }
  app.post('/test', limiter, (ctx) => ctx.text('ok'));
  const store = memoryStores.get(limiter.keyPrefix)!;
  return {
    app,
    /** The keys the route counted requests under. */
    keys: () => store.dump().storage.map(({ key }) => key),
    counted: async (key: string) => (await store.get(key))?.consumedPoints ?? 0,
  };
}

/** Fake node-server bindings so getIp's socket fallback resolves to null without crashing. */
const emptyBindings = { incoming: { socket: {} } } as Env['Bindings'];

describe('rate limiter identifier validation', () => {
  describe('email identifier', () => {
    const route = keyedRoute(['email']);

    it('rejects a body without an email', async () => {
      expect((await route.app.request(jsonRequest('/test', { name: 'no-email' }))).status).toBe(400);
    });

    it('lets a request with an email in the body through', async () => {
      expect((await route.app.request(jsonRequest('/test', { email: 'test@example.com' }))).status).toBe(200);
    });

    it('normalizes case and whitespace into a single bucket', async () => {
      // Handlers lowercase and trim before delivering mail, so the limiter must too or one inbox gets three buckets
      for (const email of ['Victim@Example.COM', 'victim@example.com', ' VICTIM@example.com ']) {
        await route.app.request(jsonRequest('/test', { email }));
      }
      expect(await route.counted(subjectSegment('email', 'victim@example.com'))).toBe(3);
    });

    it('rejects a non-string email without keying on it', async () => {
      // Rate limiting runs before zod validation, so the body shape is untrusted here.
      expect((await route.app.request(jsonRequest('/test', { email: 42 }))).status).toBe(400);
    });

    it('rejects an email given only in the query', async () => {
      const req = new Request('http://localhost/test?email=test@example.com', { method: 'POST' });
      expect((await route.app.request(req)).status).toBe(400);
    });
  });

  describe('fallback chain identifier', () => {
    const fromIp = new Request('http://localhost/test', { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' } });

    it('keys per user when authenticated, ignoring the IP', async () => {
      const route = keyedRoute([['userId', 'ip']], 'user-1');
      expect((await route.app.request(fromIp.clone(), undefined, emptyBindings)).status).toBe(200);
      expect(route.keys()).toEqual(['userId:user-1']);
    });

    it('falls back to the IP for anonymous requests', async () => {
      const route = keyedRoute([['userId', 'ip']]);
      expect((await route.app.request(fromIp.clone(), undefined, emptyBindings)).status).toBe(200);
      expect(route.keys()).toEqual([subjectSegment('ip', '1.2.3.4')]);
    });

    it('rejects when no identifier in the chain resolves, counting nothing', async () => {
      const route = keyedRoute([['userId', 'ip']]);
      const req = new Request('http://localhost/test', { method: 'POST' });
      expect((await route.app.request(req, undefined, emptyBindings)).status).toBe(400);
      expect(route.keys()).toEqual([]);
    });
  });

  describe('pseudonymous subjects', () => {
    it('must not store an IP or an address in the clear via the key', () => {
      const ip = subjectSegment('ip', '1.2.3.4');
      const email = subjectSegment('email', 'victim@example.com');
      expect(ip).toMatch(/^ip:[0-9a-f]{32}$/);
      expect(email).toMatch(/^email:[0-9a-f]{32}$/);
      expect(`${ip}${email}`).not.toMatch(/1\.2\.3\.4|victim|example/);
      // The same subject under another kind is another pseudonym; an id stays legible.
      expect(subjectSegment('email', '1.2.3.4')).not.toBe(ip);
      expect(subjectSegment('userId', 'user-1')).toBe('userId:user-1');
    });

    it('keeps one bucket per subject: an IPv6 /64, an address whatever its case', () => {
      expect(subjectSegment('ip', '2001:db8:aaaa:bbbb::1')).toBe(subjectSegment('ip', '2001:db8:aaaa:bbbb:ffff::2'));
      expect(subjectSegment('ip', '2001:db8:aaaa:bbbb::1')).not.toBe(subjectSegment('ip', '2001:db8:aaaa:cccc::1'));
      expect(subjectSegment('email', ' Victim@Example.COM ')).toBe(subjectSegment('email', 'victim@example.com'));
    });
  });

  describe('empty key guard', () => {
    it('rejects when the key resolves empty (userId limiter on an anonymous request)', async () => {
      const route = keyedRoute(['userId']);
      const req = new Request('http://localhost/test', { method: 'POST' });
      expect((await route.app.request(req, undefined, emptyBindings)).status).toBe(400);
    });

    it('lets the request through when the optional identifier resolves', async () => {
      const route = keyedRoute(['userId'], 'user-2');
      const req = new Request('http://localhost/test', { method: 'POST' });
      expect((await route.app.request(req, undefined, emptyBindings)).status).toBe(200);
    });
  });
});
