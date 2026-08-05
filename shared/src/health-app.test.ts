import { describe, expect, it } from 'vitest';
import { createHealthApp } from './health-app';

const app = createHealthApp({
  version: 'sha-123',
  full: () => ({ httpStatus: 200, body: { status: 'healthy', version: 'sha-123' } }),
});

describe('createHealthApp', () => {
  it('shallow GET /health returns 204 with version and caching headers', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(204);
    expect(res.headers.get('X-App-Version')).toBe('sha-123');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=5');
  });

  it('depth=full returns the callback JSON with the same headers', async () => {
    const res = await app.request('/health?depth=full');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'healthy', version: 'sha-123' });
    expect(res.headers.get('X-App-Version')).toBe('sha-123');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=5');
  });

  it('propagates a 503 status from the full callback', async () => {
    const sick = createHealthApp({
      version: 'sha-503',
      full: async () => ({ httpStatus: 503, body: { status: 'unhealthy' } }),
    });
    const res = await sick.request('/health?depth=full');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'unhealthy' });
  });

  it('applies security headers on health responses', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains; preload');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('falls back to an empty 404 on unknown paths', async () => {
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
  });

  it('serves under a mount prefix (yjs same-origin migration)', async () => {
    const { Hono } = await import('hono');
    const mounted = new Hono();
    mounted.route('/', app);
    mounted.route('/yjs', app);
    expect((await mounted.request('/yjs/health')).status).toBe(204);
    expect((await mounted.request('/health')).status).toBe(204);
  });
});
