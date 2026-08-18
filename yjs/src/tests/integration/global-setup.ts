import pg from 'pg';
import { testDatabaseUrl } from 'shared/test-db';

// Always the dedicated test DB, with no external override, so integration tests have one predictable source.
const DATABASE_URL = testDatabaseUrl;

/** Migrations are owned by the backend package: run `pnpm vitest --project=backend` or root `pnpm test` first so the test DB schema is current. */
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
