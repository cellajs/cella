import { sql } from 'drizzle-orm';
import { nanoidTenant } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it } from 'vitest';
import { createPgConnection } from '#/db/create-connection';
import { CDC_PUBLICATION_NAME } from '../../constants';
import { env } from '../../env';
import { cdcDb } from '../../lib/db';
import { checkReplicationSetup } from '../../services/setup-check';

/** Whether the configured database is set up for the worker at all. */
async function probeReady(): Promise<boolean> {
  try {
    const pub = await cdcDb.execute(sql`SELECT 1 FROM pg_publication WHERE pubname = ${CDC_PUBLICATION_NAME}`);
    return pub.rows.length > 0;
  } catch {
    return false;
  }
}

const READY = await probeReady();

/** The check runs against the real catalog: a migrated database passes, and each thing it guards is broken once. */
describe.skipIf(!READY)('Replication setup check (integration)', () => {
  afterEach(async () => {
    await cdcDb.execute(sql`ALTER TABLE attachments REPLICA IDENTITY FULL`);
    await cdcDb.execute(sql`DROP TABLE IF EXISTS setup_check_stray`);
    const published = await cdcDb.execute(sql`SELECT 1 FROM pg_publication_tables WHERE pubname = ${CDC_PUBLICATION_NAME} AND tablename = 'tenants'`);
    if (published.rows.length === 0) await cdcDb.execute(sql.raw(`ALTER PUBLICATION ${CDC_PUBLICATION_NAME} ADD TABLE tenants`));
  });

  it('finds nothing wrong with a migrated database (positive control)', async () => {
    expect(await checkReplicationSetup()).toEqual([]);
  });

  it('must not accept a publication that lacks a tracked table: its changes would never arrive', async () => {
    await cdcDb.execute(sql.raw(`ALTER PUBLICATION ${CDC_PUBLICATION_NAME} DROP TABLE tenants`));

    expect(await checkReplicationSetup()).toEqual([expect.stringContaining('lacks tracked tables: tenants')]);
  });

  it('must not accept a tracked table without replica identity FULL: its updates and deletes would carry no old row', async () => {
    await cdcDb.execute(sql`ALTER TABLE attachments REPLICA IDENTITY DEFAULT`);

    expect(await checkReplicationSetup()).toEqual([expect.stringContaining('without REPLICA IDENTITY FULL: attachments')]);
  });

  it('reports a published table the worker does not track', async () => {
    await cdcDb.execute(sql`CREATE TABLE setup_check_stray (id int PRIMARY KEY)`);
    await cdcDb.execute(sql.raw(`ALTER PUBLICATION ${CDC_PUBLICATION_NAME} ADD TABLE setup_check_stray`));

    expect(await checkReplicationSetup()).toEqual([expect.stringContaining('does not track: setup_check_stray')]);
  });
});

/** The worker locks the product rows it stamps: the server must take those locks back from a worker that hangs. */
describe.skipIf(!READY)("The worker's database sessions (integration)", () => {
  it('carries the lock, statement and idle-in-transaction limits on every session', async () => {
    const settings = await cdcDb.execute<{ lock: string; statement: string; idle: string }>(sql`
      SELECT current_setting('lock_timeout') AS lock, current_setting('statement_timeout') AS statement,
             current_setting('idle_in_transaction_session_timeout') AS idle
    `);

    expect(settings.rows[0]).toEqual({ lock: '10s', statement: '1min', idle: '30s' });
  });

  it('must not keep a row lock via a session that sits in its transaction: the server ends it', async () => {
    const hanging = createPgConnection(env.DATABASE_CDC_URL, {
      max: 1,
      sessionTimeouts: { lockMs: 10_000, statementMs: 60_000, idleInTransactionMs: 300 },
    });
    // The server ends this session on purpose, which the checked-out client reports as an error event: the expected outcome here.
    if ('idleCount' in hanging.$client) hanging.$client.on('connect', (client) => client.on('error', () => {}));
    const tenantId = nanoidTenant();
    await cdcDb.execute(sql`INSERT INTO tenants (id, name) VALUES (${tenantId}, 'lock-probe')`);

    try {
      // A worker cut off in the middle of a flush: the lock is taken, and no statement follows.
      const held = hanging.transaction(async (tx) => {
        await tx.execute(sql`SELECT 1 FROM tenants WHERE id = ${tenantId} FOR NO KEY UPDATE`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await tx.execute(sql`SELECT 1`);
      });
      await expect(held).rejects.toThrow();

      // The API's edit of that row goes through: nothing holds it any more.
      const edit = await cdcDb.execute(sql`UPDATE tenants SET name = 'edited' WHERE id = ${tenantId}`);
      expect(edit.rowCount).toBe(1);
    } finally {
      await cdcDb.execute(sql`DELETE FROM activities WHERE subject_id = ${tenantId}`);
      await cdcDb.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
      await hanging.$client.end().catch(() => {});
    }
  });
});
