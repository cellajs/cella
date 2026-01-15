/**
 * Global setup for Vitest.
 * Runs once before all tests to check Postgres availability and run migrations.
 */

import path from 'node:path';
import { env as dotenv } from '@dotenv-run/core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { checkMark, crossMark, loadingMark } from '#/utils/console';

// Load .env file from project root
dotenv({ root: '../..', files: ['.env'] });

// Use dedicated test database if available (port 5434), otherwise fall back to main database
const DATABASE_TEST_URL = 'postgres://postgres:postgres@0.0.0.0:5434/postgres';
const DATABASE_URL = process.env.DATABASE_TEST_URL || DATABASE_TEST_URL;

/**
 * Check if Postgres is available and run migrations.
 * If Postgres is not available, exit gracefully with a message.
 */
export default async function globalSetup() {
  if (!DATABASE_URL) {
    console.info(`\n${crossMark}  Skipping backend tests: DATABASE_URL not set`);
    console.info('   Run `pnpm dev` to start Postgres, then run tests again.\n');
    process.exit(0);
  }

  // Try to connect to Postgres
  const client = new pg.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
  } catch (error) {
    console.info(`\n${crossMark}  Skipping backend tests: Cannot connect to Postgres`);
    console.info(`   DATABASE_URL: ${DATABASE_URL}`);
    console.info('   Run `pnpm dev` to start Postgres, then run tests again.\n');
    process.exit(0);
  }

  // Run migrations once for all tests
  console.info(`\n${loadingMark} Running database migrations...`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle({ client: pool, casing: 'snake_case' });
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

  try {
    await migrate(db, { migrationsFolder, migrationsSchema: 'drizzle-backend' });
    console.info(`${checkMark} Migrations complete\n`);
  } catch (error) {
    console.error(`${crossMark} Migration failed:`, error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
