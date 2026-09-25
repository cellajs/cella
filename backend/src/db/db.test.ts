import { describe, expect, it } from 'vitest';
import { dbConfig, queryLoggerEnabled } from '#/db/db';

/** Drizzle's query logger prints every query with the values it bound (tokens, addresses) to stdout. */
describe('query logger', () => {
  it('must not print query values via DEBUG outside development', () => {
    for (const mode of ['test', 'tunnel', 'staging', 'production'] as const) {
      expect(queryLoggerEnabled(true, mode), mode).toBe(false);
    }
    // The test process itself: its env holds DEBUG as the unparsed string the .env file gives.
    expect(dbConfig.logger).toBe(false);
  });

  it('prints queries with DEBUG in development (positive control)', () => {
    expect(queryLoggerEnabled(true, 'development')).toBe(true);
    expect(queryLoggerEnabled(false, 'development')).toBe(false);
  });
});
