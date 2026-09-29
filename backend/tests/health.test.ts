import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestOauthServer } from './oauth-helpers';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

async function fetchHealth(query = '') {
  const { baseApp: app } = await import('#/routes');
  return app.fetch(new Request(`http://localhost/health${query}`));
}

/** A deep health response's HTTP status with its `authInvalidation` component. */
async function authInvalidationIn(res: Response) {
  const body = (await res.json()) as { components: { authInvalidation?: { status?: string; reason?: string } } };
  return { httpStatus: res.status, ...body.components.authInvalidation };
}

const authInvalidation = async () => authInvalidationIn(await fetchHealth('?depth=full'));

/**
 * Every process starts its auth invalidation listener at boot, as this file does before the diagnostics are read: a
 * process that hears no invalidations keeps ended sessions and removed memberships cached.
 */
describe('Health endpoint', async () => {
  const { listenForAuthInvalidation } = await import('#/middlewares/guard/invalidation-listener');
  // Read before the listener starts: the state between a process's boot and its first LISTEN.
  const beforeListening = await authInvalidation();
  let stop: () => Promise<void>;

  beforeAll(async () => {
    stop = listenForAuthInvalidation();
    await vi.waitFor(async () => expect((await authInvalidation()).status).toBe('healthy'));
  });

  afterAll(async () => await stop());

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
    expect(res.headers.get('cache-control')).toContain('max-age=5');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('components');
    expect(components).toHaveProperty('api');
    expect(components).toHaveProperty('database');
    expect(components).toHaveProperty('cdc');
    expect(components).toHaveProperty('jobs');
    expect(['healthy', 'degraded']).toContain(components.jobs.status);
    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    expect(['healthy', 'unhealthy']).toContain(components.database.status);
    expect(components.api.details).toHaveProperty('heapUsedMb');
    expect(components.api.details).toHaveProperty('heapTotalMb');
    expect(components.api.details).toHaveProperty('rssMb');
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

  it('must not report a process healthy while nothing hears session endings: before the listener starts and once it stopped', async () => {
    // The authorization server holds the tenant cache, so its own health reports the same component.
    const oauth = await startTestOauthServer();
    const oauthAuthInvalidation = async () => authInvalidationIn(await fetch(`${oauth.issuer}/health?depth=full`));
    try {
      expect(beforeListening).toMatchObject({ httpStatus: 503, status: 'unhealthy', reason: 'never_started' });
      expect(await authInvalidation()).toMatchObject({ httpStatus: 200, status: 'healthy' });
      expect(await oauthAuthInvalidation()).toMatchObject({ httpStatus: 200, status: 'healthy' });
      await stop();
      expect(await authInvalidation()).toMatchObject({ httpStatus: 503, status: 'unhealthy', reason: 'stopped' });
      expect(await oauthAuthInvalidation()).toMatchObject({ httpStatus: 503, status: 'unhealthy', reason: 'stopped' });
    } finally {
      await oauth.close();
    }
  });
});
