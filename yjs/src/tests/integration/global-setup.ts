/**
 * Global setup for yjs integration tests.
 * Checks Postgres availability on the configured test database (see `test-db-config.ts`).
 *
 * Migrations are owned by the backend package — run `pnpm vitest --project=backend`
 * or `pnpm test` from root first to ensure the test DB schema is up to date.
 */

import pg from 'pg';
import { testDatabaseUrl } from '../../../../test-db-config';

// Always target the dedicated test DB (no external override) so integration tests have a single, predictable DB source.
const DATABASE_URL = testDatabaseUrl;

export default async function globalSetup() {
  const client = new pg.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
  } catch {
    console.error('\n  ⨯ yjs integration tests require Postgres but cannot connect');
    console.error(`    DATABASE_URL: ${DATABASE_URL}`);
    console.error('    Run `pnpm docker:test` (or `pnpm dev`) to start Postgres, then run tests again.\n');
    process.exit(1);
  }
}
