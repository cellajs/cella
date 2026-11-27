import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, describe, expect, it } from 'vitest';
import { createPgConnection, isPool } from '#/db/create-connection';

/**
 * The client's deadline ends a frozen connection with node-postgres's `end()`, which destroys the socket of a client
 * whose statement is still active. A driver that ended it gracefully would make the `ROLLBACK` behind a frozen
 * statement wait a deadline of its own: this pins that contract across node-postgres upgrades.
 */
describe('a pool client ended while its statement runs', () => {
  const db = createPgConnection(testDatabaseUrl, { max: 1 });
  const pool = db.$client;
  afterAll(() => (isPool(pool) ? pool.end() : undefined));

  it('fails the statement and the rollback queued behind it at once', async () => {
    if (!isPool(pool)) throw new Error('the test needs a pg pool');
    const client = await pool.connect();
    client.on('error', () => undefined);
    const outcome = (error: Error) => error.message;
    const active = client.query('select pg_sleep(10)').then(() => 'answered', outcome);
    const queued = client.query('rollback').then(() => 'answered', outcome);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const endedAt = Date.now();
    await client.end();
    expect(await active).toMatch(/^Connection terminated/);
    expect(await queued).toMatch(/^Connection terminated/);
    expect(Date.now() - endedAt).toBeLessThan(2_000);
    client.release(true);
  });
});
