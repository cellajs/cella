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
    const components = body.components as Record<string, any>;

    expect(res.status).toBe(200);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('components');
    expect(components).toHaveProperty('api');
    expect(components).toHaveProperty('database');
    expect(components).toHaveProperty('cdc');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    expect(['healthy', 'unhealthy']).toContain(components.database.status);
    expect(components.api.details).toHaveProperty('heapUsedMb');
    expect(components.api.details).toHaveProperty('heapTotalMb');
    expect(components.api.details).toHaveProperty('rssMb');
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
    const cdc = body.components?.cdc as Record<string, any>;

    expect(cdc).toHaveProperty('status');
    expect(cdc).toHaveProperty('checkedVia');
    expect(cdc).toHaveProperty('details');
    expect(cdc.details).toHaveProperty('wsConnected');
    expect(cdc.details).toHaveProperty('lastMessageAt');
    expect(cdc.details).toHaveProperty('messages');
    expect(cdc.details).toHaveProperty('parseErrors');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(cdc.status);
  });
});
