import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { testRuntimeDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as adminDb } from '#/db/db';
import { allAdminOnlyWriteTables } from '#/db/immutability-triggers';

const TEST_USER = '00000000-0000-4000-b000-0000000000f1';
const TEST_ROLE_ROW = '00000000-0000-4000-b000-0000000000f2';
const TEST_ACTIVITY = 'write-guard-activity-001';

const guardedTables = allAdminOnlyWriteTables.map(({ tableName }) => tableName);
/** The history CDC keeps: the guarded tables beside `system_roles`. */
const historyTables = guardedTables.filter((tableName) => tableName !== 'system_roles');

/** Return the PostgreSQL cause so tests distinguish trigger rejection from grant rejection. */
async function rejectionMessage(run: Promise<unknown>): Promise<string> {
  const error = await run.then(
    () => null,
    (e: unknown) => e,
  );
  if (!error) throw new Error('expected the write to be rejected, but it succeeded');
  const { cause } = error as { cause?: unknown };
  return String(cause ?? error);
}

let runtimePool: pg.Pool | undefined;
let runtimeDb: NodePgDatabase;

// Vitest evaluates the suite gate during collection. Gate only on database reachability
// so a missing trigger fails the suite.
const guardSuiteReady = await (async () => {
  try {
    // Open the GRANT layer wide, as a `permission=all` reconcile would; otherwise the grant
    // rejects the write first and the trigger is never exercised.
    await adminDb.execute(sql`GRANT USAGE ON SCHEMA public TO runtime_role`);
    for (const tableName of guardedTables) await adminDb.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tableName} TO runtime_role`));
    await adminDb.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON users TO runtime_role`);

    runtimePool = new pg.Pool({ connectionString: testRuntimeDatabaseUrl, max: 2 });
    await runtimePool.query('SELECT 1');
    runtimeDb = drizzle({ client: runtimePool });
    return true;
  } catch {
    await runtimePool?.end().catch(() => {});
    runtimePool = undefined;
    return false;
  }
})();

afterAll(async () => {
  if (runtimePool) {
    for (const tableName of guardedTables)
      await adminDb.execute(sql.raw(`REVOKE INSERT, UPDATE, DELETE ON ${tableName} FROM runtime_role`)).catch(() => {});
    await runtimePool.end().catch(() => {});
  }
  await adminDb.execute(sql`DELETE FROM activities WHERE id = ${TEST_ACTIVITY}`).catch(() => {});
  // Cascades to users
  await adminDb.execute(sql`DELETE FROM actors WHERE id = ${TEST_USER}`).catch(() => {});
});

// Runtime writes must remain blocked even when database grants are open. Runtime reads
// and owner-driven `ON DELETE CASCADE` must continue to work.
(guardSuiteReady ? describe : describe.skip)('admin-only write guard', () => {
  beforeAll(async () => {
    await adminDb.execute(sql`DELETE FROM actors WHERE id = ${TEST_USER}`);
    // users.id is a foreign key to actors.id, so the actor row comes first
    await adminDb.execute(sql`INSERT INTO actors (id, kind, created_at) VALUES (${TEST_USER}, 'user', now())`);
    await adminDb.execute(sql`
      INSERT INTO users (id, entity_type, name, slug, email, created_at)
      VALUES (${TEST_USER}, 'user', 'Guard Probe', ${`guard-${randomUUID().slice(0, 8)}`}, ${`guard-${randomUUID().slice(0, 8)}@example.com`}, now())
    `);
    await adminDb.execute(sql`
      INSERT INTO system_roles (id, user_id, role) VALUES (${TEST_ROLE_ROW}, ${TEST_USER}, 'admin')
    `);
    // The admin connection still writes the history: this insert is the positive control.
    await adminDb.execute(sql`
      INSERT INTO activities (id, action, table_name, type, created_at)
      VALUES (${TEST_ACTIVITY}, 'create', 'write_guard_probe', 'entity', now())
      ON CONFLICT DO NOTHING
    `);
  });

  it('lets runtime_role read system_roles', async () => {
    const result = await runtimeDb.execute<{ role: string }>(sql`SELECT role FROM system_roles WHERE user_id = ${TEST_USER}`);
    expect(result.rows).toHaveLength(1);
  });

  it('blocks runtime_role from inserting a system role, even with the grant open', async () => {
    const message = await rejectionMessage(
      runtimeDb.execute(sql`
        INSERT INTO system_roles (id, user_id, role)
        VALUES (${randomUUID()}, ${TEST_USER}, 'admin')
      `),
    );
    expect(message).toMatch(/not writable by runtime_role/);
  });

  it('blocks runtime_role from updating a system role, even with the grant open', async () => {
    const message = await rejectionMessage(runtimeDb.execute(sql`UPDATE system_roles SET role = 'admin' WHERE user_id = ${TEST_USER}`));
    expect(message).toMatch(/not writable by runtime_role/);
  });

  it('blocks runtime_role from deleting a system role, even with the grant open', async () => {
    const message = await rejectionMessage(runtimeDb.execute(sql`DELETE FROM system_roles WHERE user_id = ${TEST_USER}`));
    expect(message).toMatch(/not writable by runtime_role/);

    const survived = await adminDb.execute<Record<string, unknown>>(sql`SELECT 1 FROM system_roles WHERE user_id = ${TEST_USER}`);
    expect(survived.rows).toHaveLength(1);
  });

  // `DEFAULT VALUES` names no column and a row trigger fires before any NOT NULL check: one statement probes every table.
  it.each(historyTables)('blocks runtime_role from inserting into %s, even with the grant open', async (tableName) => {
    const message = await rejectionMessage(runtimeDb.execute(sql.raw(`INSERT INTO ${tableName} DEFAULT VALUES`)));
    expect(message).toMatch(/not writable by runtime_role/);
  });

  it('blocks runtime_role from deleting an activity, even with the grant open', async () => {
    const message = await rejectionMessage(runtimeDb.execute(sql`DELETE FROM activities WHERE id = ${TEST_ACTIVITY}`));
    expect(message).toMatch(/not writable by runtime_role/);

    const survived = await adminDb.execute<Record<string, unknown>>(sql`SELECT 1 FROM activities WHERE id = ${TEST_ACTIVITY}`);
    expect(survived.rows).toHaveLength(1);
  });

  it('still lets the admin connection write system_roles (seeds must work)', async () => {
    await expect(adminDb.execute(sql`UPDATE system_roles SET role = 'admin' WHERE user_id = ${TEST_USER}`)).resolves.toBeDefined();
  });

  it('does not break the ON DELETE CASCADE from users', async () => {
    // The cascade deletes system_roles as the referencing table's owner; the guard must not fire
    // or account deletion breaks for every user holding a system role.
    await expect(runtimeDb.execute(sql`DELETE FROM users WHERE id = ${TEST_USER}`)).resolves.toBeDefined();

    const orphaned = await adminDb.execute<Record<string, unknown>>(sql`SELECT 1 FROM system_roles WHERE user_id = ${TEST_USER}`);
    expect(orphaned.rows).toHaveLength(0);
  });
});
