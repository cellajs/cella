import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { testDatabaseUrl, testWorkerDatabase, withDatabase } from 'shared/test-db';
import type { TestProject } from 'vitest/node';
import { crossMark, startSpinner, succeedSpinner } from '#/utils/console';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = testDatabaseUrl;
/** Arbitrary advisory lock key shared by every backend test run against the test database. */
const testRunLockKey = 7_365_224;
// Resolve from __dirname so Vitest workspace cwd does not affect migration lookup.
const migrationsFolder = path.resolve(__dirname, '../drizzle');
const resetHint = '   Reset the test volume: `pnpm docker:test:reset && pnpm docker:test`, then run tests again.\n';
/** Postgres codes for a statement that creates what the database already holds: duplicate column, table, object. */
const alreadyExistsCodes = new Set(['42701', '42P07', '42710']);

/**
 * Global test setup: provisions the RLS roles, then creates and migrates the test databases. The order matters: the RLS,
 * trigger and grant blocks need the roles at migration time, and the verify block aborts the migration without them.
 * Nothing here repairs catalog state after the migration; the schema the tests inspect is the schema the migration
 * produced.
 */
export default async function globalSetup(project: TestProject) {
  if (!DATABASE_URL) {
    console.error(`\n${crossMark}  Backend tests require a database: DATABASE_URL not set`);
    console.error('   Run `pnpm docker:test` (or `pnpm dev`) to start Postgres, then run tests again.\n');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
  } catch (error) {
    console.error(`\n${crossMark}  Backend tests require Postgres but cannot connect`);
    console.error(`   DATABASE_URL: ${DATABASE_URL}`);
    console.error('   Run `pnpm docker:test` (or `pnpm dev`) to start Postgres, then run tests again.\n');
    process.exit(1);
  }

  // Worktrees and parallel sessions share one test database, and a run truncates and seeds rows another run reads, so
  // runs take turns: this session holds an advisory lock until the teardown below ends it.
  const lockClient = new pg.Client({ connectionString: DATABASE_URL });
  await lockClient.connect();
  const { rows: locked } = await lockClient.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1) AS acquired', [testRunLockKey]);
  if (!locked[0]?.acquired) {
    console.info('Another backend test run is using the test database; waiting for it to finish...');
    await lockClient.query('SELECT pg_advisory_lock($1)', [testRunLockKey]);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Roles first: the side-effect migration blocks apply ownership, RLS, grants and triggers
  // only when the roles exist, and the verify block rejects a database without them.
  // admin_role gets no BYPASSRLS on purpose: production providers (Scaleway) cannot grant it, so the
  // suite proves the owner-bypass path the CDC worker and admin connection rely on. An older volume
  // that created the role with the attribute is converged.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime_role') THEN
        CREATE ROLE runtime_role WITH LOGIN PASSWORD 'dev_password';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
        CREATE ROLE admin_role WITH LOGIN PASSWORD 'dev_password';
      ELSE
        ALTER ROLE admin_role NOBYPASSRLS;
      END IF;
    END $$;
  `);

  // Backend test files run in parallel, each worker on its own database (tests/setup.ts); the shared one stays for the yjs
  // and cdc integration tests. VITEST_POOL_ID runs from 1 to `maxWorkers`, which defaults to one less than the cores.
  // Created once and then migrated in place, like the shared one.
  const workers = Number(project.config.maxWorkers || project.globalConfig.maxWorkers) || os.availableParallelism();
  const workerDatabases = Array.from({ length: workers }, (_, i) => testWorkerDatabase(i + 1));
  const { rows: existing } = await pool.query<{ datname: string }>('SELECT datname FROM pg_database WHERE datname = ANY($1)', [workerDatabases]);
  for (const database of workerDatabases) {
    if (!existing.some((row) => row.datname === database)) await pool.query(`CREATE DATABASE "${database}"`);
  }
  await pool.end();

  const spinner = startSpinner('Running database migrations...');

  const urls = [DATABASE_URL, ...workerDatabases.map((database) => withDatabase(DATABASE_URL, database))];
  let results: Awaited<ReturnType<typeof prepareDatabase>>[];
  try {
    results = await Promise.all(urls.map(prepareDatabase));
    succeedSpinner('Migrations complete');
  } catch (error) {
    spinner.fail('Migration failed');
    console.error(error);
    // Applied migrations are tracked by folder name, so one applied under another name (a renamed folder, another branch) runs again.
    if (alreadyExistsCodes.has(postgresErrorCode(error) ?? '')) {
      console.error(`\n${crossMark}  A migration ran again on a test database that already holds what it creates`);
      console.error(resetHint);
    }
    process.exit(1);
  }

  const degraded = results.filter((result) => result !== null);
  for (const found of degraded) {
    console.error(
      `\n${crossMark}  Test database ${found.database} was migrated without the RLS roles (yjs_documents: ${JSON.stringify(found.state)})`,
    );
    console.error(resetHint);
  }
  if (degraded.length) process.exit(1);

  // Closing the session releases the lock for the next waiting run.
  return async () => {
    await lockClient.end();
  };
}

/** The Postgres error code of a failed query: the driver's error sits under the ORM's as `cause`. */
function postgresErrorCode(error: unknown): string | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ('code' in current && typeof current.code === 'string') return current.code;
  }
  return undefined;
}

/**
 * Grants the roles the public schema, migrates, and checks the catalog of one test database. A database migrated before
 * the roles existed keeps its degraded catalog (migrations do not re-run) and RLS-dependent tests would pass vacuously on
 * it, so its RLS state is returned for the setup to refuse.
 */
async function prepareDatabase(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query('GRANT USAGE ON SCHEMA public TO runtime_role; GRANT ALL ON SCHEMA public TO admin_role;');
    await migrate(drizzle({ client: pool }), { migrationsFolder, migrationsSchema: 'drizzle-backend' });

    const { rows } = await pool.query<{ enabled: boolean; forced: boolean; granted: boolean; owner: string }>(`
      SELECT relrowsecurity AS enabled,
             relforcerowsecurity AS forced,
             has_table_privilege('runtime_role', 'public.yjs_documents', 'SELECT') AS granted,
             pg_get_userbyid(relowner) AS owner
      FROM pg_class WHERE relname = 'yjs_documents' AND relnamespace = 'public'::regnamespace
    `);
    const state = rows[0];
    if (state?.enabled && !state.forced && state.granted && state.owner === 'admin_role') return null;
    return { database: new URL(url).pathname.slice(1), state };
  } finally {
    await pool.end();
  }
}
