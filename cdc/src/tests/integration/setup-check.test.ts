import { sql } from 'drizzle-orm';
import { nanoidTenant } from 'shared/utils/nanoid';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

/** The role the worker connects as, read from the real catalog under each role the dev database has. */
describe.skipIf(!READY)('Replication setup check: the role of the worker (integration)', () => {
  /** Whether `admin_role` holds BYPASSRLS on this database: no migration asks for it, and an older setup may have it. */
  let adminBypass = false;
  let adminReplication = false;
  const setAdminBypass = (bypass: boolean) => cdcDb.execute(sql.raw(`ALTER ROLE admin_role ${bypass ? 'BYPASSRLS' : 'NOBYPASSRLS'}`));

  beforeAll(async () => {
    const [role] = (
      await cdcDb.execute<{ bypass: boolean; replication: boolean }>(
        sql`SELECT rolbypassrls AS bypass, rolreplication AS replication FROM pg_roles WHERE rolname = 'admin_role'`,
      )
    ).rows;
    adminBypass = role.bypass;
    adminReplication = role.replication;
  });

  beforeEach(async () => {
    await setAdminBypass(false);
    // The test setup makes the role without it; a deployment grants it, and these cases are about the bypass.
    await cdcDb.execute(sql`ALTER ROLE admin_role REPLICATION`);
  });

  afterEach(async () => {
    // As the RLS migration leaves it: enabled, never forced.
    await cdcDb.execute(sql`ALTER TABLE attachments NO FORCE ROW LEVEL SECURITY`);
    await setAdminBypass(adminBypass);
    await cdcDb.execute(sql.raw(`ALTER ROLE admin_role ${adminReplication ? 'REPLICATION' : 'NOREPLICATION'}`));
  });

  /** The check as a session of `role` sees the catalog. The superuser of the test database may become any role. */
  const checkAs = (role: string) =>
    cdcDb.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
      return checkReplicationSetup(tx);
    });

  it('accepts an owner without BYPASSRLS while no table forces row-level security (what a managed provider gives)', async () => {
    expect(await checkAs('admin_role')).toEqual([]);
  });

  it('must not read as a role that lacks REPLICATION, or one that row-level security filters: a seq stamp would change no row', async () => {
    const problems = await checkAs('runtime_role');

    expect(problems).toContain('role runtime_role lacks REPLICATION');
    // The tables are named, so the log says where the stamps would go missing.
    expect(problems).toContainEqual(expect.stringMatching(/^role runtime_role does not bypass row-level security on: .*\battachments\b/));
    expect(problems).toHaveLength(2);
  });

  it('must not accept the owner once a table forces row-level security on it', async () => {
    await cdcDb.execute(sql`ALTER TABLE attachments FORCE ROW LEVEL SECURITY`);

    expect(await checkAs('admin_role')).toEqual(['role admin_role does not bypass row-level security on: attachments']);
  });

  it('lets the BYPASSRLS attribute stand in for owning the tables', async () => {
    await cdcDb.execute(sql`ALTER TABLE attachments FORCE ROW LEVEL SECURITY`);
    await setAdminBypass(true);

    expect(await checkAs('admin_role')).toEqual([]);
  });

  it('counts a superuser as having both', async () => {
    await cdcDb.execute(sql`ALTER TABLE attachments FORCE ROW LEVEL SECURITY`);

    // The suite's own connection is the superuser of the test database.
    expect(await checkReplicationSetup()).toEqual([]);
  });
});

/** The worker locks the product rows it stamps: Postgres must take those locks back from a worker that hangs. */
describe.skipIf(!READY)("The worker's database sessions (integration)", () => {
  it('carries the lock, statement and idle-in-transaction limits on every session', async () => {
    const settings = await cdcDb.execute<{ lock: string; statement: string; idle: string }>(sql`
      SELECT current_setting('lock_timeout') AS lock, current_setting('statement_timeout') AS statement,
             current_setting('idle_in_transaction_session_timeout') AS idle
    `);

    expect(settings.rows[0]).toEqual({ lock: '10s', statement: '1min', idle: '30s' });
  });

  it('must not keep a row lock via a session that sits in its transaction: Postgres ends it', async () => {
    const hanging = createPgConnection(env.DATABASE_CDC_URL, {
      max: 1,
      sessionTimeouts: { lockMs: 10_000, statementMs: 60_000, idleInTransactionMs: 300 },
    });
    // Postgres ends this session on purpose, which the checked-out client reports as an error event: the expected outcome here.
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
