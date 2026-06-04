import { describe, expect, it } from 'vitest';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

async function fetchHealth(query = '') {
  const { default: app } = await import('#/routes');
  return app.fetch(new Request(`http://localhost/health${query}`));
}

describe('Health endpoint', () => {
  it('GET /health returns shallow 204 by default', async () => {
    const res = await fetchHealth();

    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toContain('max-age=5');
    const text = await res.text();
    expect(text).toBe('');
  });

  it('GET /health?depth=full returns full diagnostics', async () => {
    const res = await fetchHealth('?depth=full');
    const body = (await res.json()) as Record<string, any>;

    expect(res.status).toBe(200);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('database');
    expect(body).toHaveProperty('cdc');
    expect(body).toHaveProperty('memory');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    expect(['connected', 'disconnected']).toContain(body.database);
    expect(body.memory).toHaveProperty('heapUsed');
    expect(body.memory).toHaveProperty('heapTotal');
    expect(body.memory).toHaveProperty('rss');
  });

  it('GET /health?depth=shallow still returns 204 (explicit shallow)', async () => {
    const res = await fetchHealth('?depth=shallow');

    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toContain('max-age=5');
    const text = await res.text();
    expect(text).toBe('');
  });

  it('GET /health?depth=full response has cache headers', async () => {
    const res = await fetchHealth('?depth=full');

    // Only healthy/degraded (200) get cache headers
    if (res.status === 200) {
      expect(res.headers.get('cache-control')).toContain('max-age=10');
    }
  });

  it('GET /health?depth=full cdc section has expected shape', async () => {
    const res = await fetchHealth('?depth=full');
    const body = (await res.json()) as Record<string, any>;

    expect(body.cdc).toHaveProperty('cdcConnected');
    expect(body.cdc).toHaveProperty('lastMessageAt');
    expect(body.cdc).toHaveProperty('messagesReceived');
    expect(body.cdc).toHaveProperty('parseErrors');
    expect(body.cdc).toHaveProperty('status');
    expect(['healthy', 'degraded', 'unknown']).toContain(body.cdc.status);
  });
});
