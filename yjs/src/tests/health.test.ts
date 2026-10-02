import { describe, expect, it, vi } from 'vitest';

const listener = { status: 'listening' as 'listening' | 'connecting' | 'off' };
vi.mock('../data/listener', () => ({ logListenerStatus: () => listener.status, stopLogListener: vi.fn() }));
vi.mock('../data/db', () => ({ closeDb: vi.fn() }));
vi.mock('../server/upgrade', () => ({ setupConnectionHandler: vi.fn(), setupUpgradeHandler: vi.fn() }));

const { buildHttpApp } = await import('../server/ws-server');

/** The full health body, on both the bare path and the `/yjs` prefix. */
async function fullHealth() {
  const app = buildHttpApp();
  const [bare, prefixed] = await Promise.all(['/health?depth=full', '/yjs/health?depth=full'].map((path) => app.request(path)));
  expect(prefixed.status).toBe(200);
  expect(await prefixed.json()).toMatchObject({ listener: listener.status });
  return (await bare.json()) as { status: string; listener: string };
}

describe('health', () => {
  it('reports the log listener: healthy while it listens or is off (no database)', async () => {
    for (const status of ['listening', 'off'] as const) {
      listener.status = status;
      expect(await fullHealth()).toMatchObject({ status: 'healthy', listener: status });
    }
  });

  it('is degraded while the listener reconnects: outside writes reach live editors only at the live stamp', async () => {
    listener.status = 'connecting';
    expect(await fullHealth()).toMatchObject({ status: 'degraded', listener: 'connecting' });
  });
});
