/**
 * `system_roles` write-guard regression tests.
 *
 * `system_roles` decides who is a system admin, so a write from the app's runtime connection is a
 * privilege escalation. It has no RLS policy (only attachments/yjs_documents do), which left the
 * table GRANT as its single control — and that GRANT lives in the one layer Scaleway's coarse
 * per-database privilege API rewrites in bulk (`permission=all`), so one reconcile could hand
 * `runtime_role` write access silently.
 *
 * These tests therefore assert the trigger holds **with the GRANT deliberately wide open**: the
 * guard must not depend on the layer that can be reset. They also pin the two things that would
 * make the guard unshippable — reads must still work, and the `ON DELETE CASCADE` from `users`
 * must still cascade (referential actions run as the referencing table's owner, not the caller).
 *
 * Runs under `pnpm test:full` only (tests/integration/** is excluded from core).
 */

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { testRuntimeDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as adminDb } from '#/db/db';

const TEST_USER = '00000000-0000-4000-b000-0000000000f1';
const TEST_ROLE_ROW = '00000000-0000-4000-b000-0000000000f2';

/**
 * The message of the error a write was rejected with. Drizzle wraps pg errors in a
 * `DrizzleQueryError` whose own message is just the failed SQL, so the guard's `RAISE` lands on
 * `cause` — and asserting on it is what distinguishes "the trigger refused" from "the GRANT
 * refused", which is the entire point of these tests.
 */
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

/**
 * Resolved at module load, not in `beforeAll`: vitest evaluates the `describe` gate at collection
 * time, so a flag set later would leave the suite permanently skipped.
 *
 * Gates on reachability only — deliberately NOT on the trigger existing. A missing guard is the
 * regression these tests exist to catch, so it has to fail here rather than skip. (A silent skip
 * on a missing trigger is precisely how the immutability triggers stayed absent unnoticed.)
 */
const guardSuiteReady = await (async () => {
  try {
    // Open the GRANT layer wide, exactly as a `permission=all` reconcile would. Without this the
    // grant would reject the write first and the trigger would never be exercised — the tests
    // would pass while proving nothing.
    await adminDb.execute(sql`GRANT USAGE ON SCHEMA public TO runtime_role`);
    await adminDb.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON system_roles TO runtime_role`);
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
    await adminDb.execute(sql`REVOKE INSERT, UPDATE, DELETE ON system_roles FROM runtime_role`).catch(() => {});
    await runtimePool.end().catch(() => {});
  }
  await adminDb.execute(sql`DELETE FROM users WHERE id = ${TEST_USER}`).catch(() => {});
});

(guardSuiteReady ? describe : describe.skip)('system_roles write guard', () => {
  beforeAll(async () => {
    await adminDb.execute(sql`DELETE FROM users WHERE id = ${TEST_USER}`);
    await adminDb.execute(sql`
      INSERT INTO users (id, entity_type, name, slug, email, created_at)
      VALUES (${TEST_USER}, 'user', 'Guard Probe', ${`guard-${randomUUID().slice(0, 8)}`}, ${`guard-${randomUUID().slice(0, 8)}@example.com`}, now())
    `);
    await adminDb.execute(sql`
      INSERT INTO system_roles (id, user_id, role) VALUES (${TEST_ROLE_ROW}, ${TEST_USER}, 'admin')
    `);
  });

  it('lets runtime_role read system_roles', async () => {
    const result = await runtimeDb.execute(sql`SELECT role FROM system_roles WHERE user_id = ${TEST_USER}`);
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
    const message = await rejectionMessage(
      runtimeDb.execute(sql`UPDATE system_roles SET role = 'admin' WHERE user_id = ${TEST_USER}`),
    );
    expect(message).toMatch(/not writable by runtime_role/);
  });

  it('blocks runtime_role from deleting a system role, even with the grant open', async () => {
    const message = await rejectionMessage(
      runtimeDb.execute(sql`DELETE FROM system_roles WHERE user_id = ${TEST_USER}`),
    );
    expect(message).toMatch(/not writable by runtime_role/);

    const survived = await adminDb.execute(sql`SELECT 1 FROM system_roles WHERE user_id = ${TEST_USER}`);
    expect(survived.rows).toHaveLength(1);
  });

  it('still lets the admin connection write system_roles (seeds must work)', async () => {
    await expect(
      adminDb.execute(sql`UPDATE system_roles SET role = 'admin' WHERE user_id = ${TEST_USER}`),
    ).resolves.toBeDefined();
  });

  it('does not break the ON DELETE CASCADE from users', async () => {
    // The cascade issues a DELETE on system_roles as the referencing table's owner, so the guard
    // must not fire — otherwise account deletion breaks for every user holding a system role.
    await expect(runtimeDb.execute(sql`DELETE FROM users WHERE id = ${TEST_USER}`)).resolves.toBeDefined();

    const orphaned = await adminDb.execute(sql`SELECT 1 FROM system_roles WHERE user_id = ${TEST_USER}`);
    expect(orphaned.rows).toHaveLength(0);
  });
});
