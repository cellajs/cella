/**
 * Global setup for Vitest.
 * Runs once before all tests to check Postgres availability and run migrations.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { immutabilityTriggersSQL } from '#/db/immutability-triggers';
import { crossMark, startSpinner, succeedSpinner } from '#/utils/console';
import { testDatabaseUrl } from '../../shared/src/test-db';

// Get directory path for ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = testDatabaseUrl;

/**
 * Check if Postgres is available and run migrations.
 * If Postgres is not available, exit gracefully with a message.
 */
export default async function globalSetup() {
  if (!DATABASE_URL) {
    console.error(`\n${crossMark}  Backend tests require a database: DATABASE_URL not set`);
    console.error('   Run `pnpm docker:test` (or `pnpm dev`) to start Postgres, then run tests again.\n');
    process.exit(1);
  }

  // Try to connect to Postgres
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

  // Run migrations once for all tests
  const spinner = startSpinner('Running database migrations...');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle({ client: pool });
  // Use __dirname to get absolute path regardless of cwd (works with vitest workspace)
  const migrationsFolder = path.resolve(__dirname, '../drizzle');

  try {
    await migrate(db, { migrationsFolder, migrationsSchema: 'drizzle-backend' });
    succeedSpinner('Migrations complete');
  } catch (error) {
    spinner.fail('Migration failed');
    console.error(error);
    process.exit(1);
  }

  // Re-apply immutability triggers after all migrations.
  // The immutability migration runs before the RLS migration that creates
  // runtime_role, so its role-check guard skips trigger creation. Here we
  // apply all functions + triggers directly from the source definition.
  await pool.query(immutabilityTriggersSQL);

  // Ensure RLS roles exist (idempotent) before any test module is evaluated.
  // The RLS test suites gate themselves at module-load time on the presence of
  // `runtime_role`; on a fresh database those roles would otherwise only be
  // created later in the suites' own `beforeAll`, causing the whole suite to be
  // skipped on the first run (e.g. in CI). Creating them here guarantees the
  // guard sees them. Grants/ownership are still applied per-suite in `beforeAll`.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime_role') THEN
        CREATE ROLE runtime_role WITH LOGIN PASSWORD 'dev_password';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
        CREATE ROLE admin_role WITH LOGIN BYPASSRLS PASSWORD 'dev_password';
      END IF;
    END $$;
  `);

  await pool.end();
}
