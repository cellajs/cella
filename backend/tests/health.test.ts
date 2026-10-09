import { describe, expect, it, vi } from 'vitest';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// The real job store read, which a test can make fail once.
vi.mock('#/lib/jobs-health', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/jobs-health')>();
  return { ...actual, readJobsHealth: vi.fn(actual.readJobsHealth) };
});

async function fetchHealth(query = '') {
  const { baseApp: app } = await import('#/routes');
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

  it("must not show a failed job store read's own message in the unauthenticated diagnostics", async () => {
    const { readJobsHealth } = await import('#/lib/jobs-health');
    vi.mocked(readJobsHealth).mockRejectedValueOnce(new Error('failed query: select state from pgboss.job_marker'));

    const res = await fetchHealth('?depth=full');
    const text = await res.text();
    expect(text).not.toContain('job_marker');
    expect(JSON.parse(text).components.jobs).toMatchObject({ status: 'degraded', reason: 'jobs_unreadable' });
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

  it("GET /health?depth=full passes the CDC worker's own grade, reasons and details on", async () => {
    const { cdcWebSocketServer } = await import('#/lib/cdc-websocket');
    const handlers: Record<string, (data: Buffer) => void> = {};
    const socket = {
      on: (event: string, handler: (data: Buffer) => void) => {
        handlers[event] = handler;
      },
      close: () => {},
    };
    // A test double and a private entry: `accept` needs a real HTTP upgrade to get here.
    (cdcWebSocketServer as unknown as { handleConnection: (ws: typeof socket) => void }).handleConnection(socket);
    const payload = {
      status: 'degraded',
      reasons: ['reading_again', 'wal_lag_high'],
      details: { replication: 'stopped', lagBytes: 5 },
      generation: 1,
    };
    handlers.message(Buffer.from(JSON.stringify({ _control: 'health', payload })));

    try {
      const res = await fetchHealth('?depth=full');
      const cdc = ((await res.json()) as Record<string, any>).components.cdc;

      expect(cdc).toMatchObject({ status: 'degraded', checkedVia: 'push', reason: 'reading_again,wal_lag_high' });
      expect(cdc.details).toMatchObject({ wsConnected: true, replication: 'stopped', lagBytes: 5, parseErrors: 0 });
      expect(cdc.ageMs).toBeGreaterThanOrEqual(0);
    } finally {
      cdcWebSocketServer.close();
    }
  });
});
