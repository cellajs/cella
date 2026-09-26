import { afterEach, describe, expect, it, vi } from 'vitest';

// The pool is never opened: the test reads the options the relay builds it with.
const { createPgConnection } = vi.hoisted(() => ({
  createPgConnection: vi.fn((_url: string, _options: { logger?: unknown }) => ({})),
}));
vi.mock('#/db/create-connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/db/create-connection')>()),
  createPgConnection,
}));

/** Imports the relay's pool module afresh under `env` and returns the query logger option it passed. */
async function queryLoggerUnder(env: Record<string, string>): Promise<unknown> {
  vi.resetModules();
  createPgConnection.mockClear();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  await import('../data/db');
  return createPgConnection.mock.calls[0]?.[1].logger;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Drizzle's query logger prints every query with the values it bound (tokens, addresses) to stdout. */
describe('relay query logger', () => {
  it('must not print query values via DEBUG outside development', async () => {
    for (const mode of ['test', 'staging', 'production']) {
      expect(await queryLoggerUnder({ DEBUG: 'true', APP_MODE: mode }), mode).toBe(false);
    }
  });

  it('prints queries with DEBUG in development (positive control)', async () => {
    expect(await queryLoggerUnder({ DEBUG: 'true', APP_MODE: 'development' })).toBe(true);
    expect(await queryLoggerUnder({ DEBUG: 'false', APP_MODE: 'development' })).toBe(false);
  });
});
