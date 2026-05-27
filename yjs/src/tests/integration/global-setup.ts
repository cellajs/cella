/**
 * Global setup for yjs integration tests.
 * Checks Postgres availability on the test database (port 5434).
 *
 * Migrations are owned by the backend package — run `pnpm vitest --project=backend`
 * or `pnpm test` from root first to ensure the test DB schema is up to date.
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@0.0.0.0:5434/postgres';

export default async function globalSetup() {
  const client = new pg.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
  } catch {
    console.info('\n  ⨯ Skipping yjs integration tests: Cannot connect to Postgres');
    console.info(`    DATABASE_URL: ${DATABASE_URL}`);
    console.info('    Run `pnpm dev` to start Postgres, then run tests again.\n');
    process.exit(0);
  }
}
