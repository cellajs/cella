import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { appConfig, type ConfigMode } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { describe, expect, it, vi } from 'vitest';
import { createPgConnection } from '#/db/create-connection';
import { overrideConfig } from '../../tests/fixtures';

/**
 * Runs one query binding a fresh value on a pool built with `debug` while the app runs in `mode`, as the API and both
 * workers build theirs, and reports whether stdout received the value.
 */
async function printsBoundValue(mode: ConfigMode, debug: boolean): Promise<boolean> {
  const restoreMode = overrideConfig(appConfig, { mode });
  const db = createPgConnection(testDatabaseUrl, { max: 1, debug });
  restoreMode();

  const value = `bound-${randomUUID()}`;
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await db.execute(sql`select ${value}::text`);
    return stdout.mock.calls.some((args) => args.join(' ').includes(value));
  } finally {
    stdout.mockRestore();
    await (db.$client as Pool).end();
  }
}

describe('query logger', () => {
  it('must not print the values a query bound via DEBUG outside development', async () => {
    for (const mode of ['test', 'tunnel', 'staging', 'production'] as const) {
      expect(await printsBoundValue(mode, true), mode).toBe(false);
    }
  });

  it('prints queries with DEBUG in development (positive control)', async () => {
    expect(await printsBoundValue('development', true)).toBe(true);
    expect(await printsBoundValue('development', false)).toBe(false);
  });
});
