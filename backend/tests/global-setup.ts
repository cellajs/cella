import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { testDatabaseUrl } from 'shared/test-db';
import { crossMark, startSpinner, succeedSpinner } from '#/utils/console';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = testDatabaseUrl;

/**
 * Global test setup: provisions the RLS roles, then migrates. The order matters: the RLS,
 * trigger and grant blocks need the roles at migration time, and the verify block aborts the
 * migration without them. Nothing here repairs catalog state after the migration; the schema
 * the tests inspect is the schema the migration produced.
 */
export default async function globalSetup() {
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
      GRANT USAGE ON SCHEMA public TO runtime_role;
      GRANT ALL ON SCHEMA public TO admin_role;
    END $$;
  `);

  const spinner = startSpinner('Running database migrations...');

  const db = drizzle({ client: pool });
  // Resolve from __dirname so Vitest workspace cwd does not affect migration lookup.
  const migrationsFolder = path.resolve(__dirname, '../drizzle');

  try {
    await migrate(db, { migrationsFolder, migrationsSchema: 'drizzle-backend' });
    succeedSpinner('Migrations complete');
  } catch (error) {
    spinner.fail('Migration failed');
    console.error(error);
    process.exit(1);
  }

  // A volume migrated before the roles existed keeps its degraded catalog (migrations do not
  // re-run) and RLS-dependent tests would pass vacuously on it, so the setup refuses such a volume.
  const { rows } = await pool.query<{ enabled: boolean; forced: boolean; granted: boolean; owner: string }>(`
    SELECT relrowsecurity AS enabled,
           relforcerowsecurity AS forced,
           has_table_privilege('runtime_role', 'public.yjs_documents', 'SELECT') AS granted,
           pg_get_userbyid(relowner) AS owner
    FROM pg_class WHERE relname = 'yjs_documents' AND relnamespace = 'public'::regnamespace
  `);
  const state = rows[0];
  if (!state?.enabled || state.forced || !state.granted || state.owner !== 'admin_role') {
    console.error(
      `\n${crossMark}  Test database was migrated without the RLS roles (yjs_documents: ${JSON.stringify(state)})`,
    );
    console.error('   Reset the test volume: `pnpm docker:test:reset && pnpm docker:test`, then run tests again.\n');
    await pool.end();
    process.exit(1);
  }

  await pool.end();
}
