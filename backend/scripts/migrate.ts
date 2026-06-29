/**
 * Standalone migration runner.
 *
 * Applies drizzle migrations + creates DB roles against the DB pointed to by
 * DATABASE_ADMIN_URL. Used for one-shot scenarios (production rebuild,
 * dry-run schema comparisons) where you don't want to start the full server.
 *
 * Usage:
 *   DATABASE_ADMIN_URL='postgres://...' pnpm --filter backend migrate
 */

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pc from 'picocolors';
import { migrateConfig, migrationDb } from '#/db/db';
import { createDbRoles } from './db/create-db-roles';

if (!migrationDb) {
  console.error(pc.red('DATABASE_ADMIN_URL required for migrations'));
  process.exit(1);
}

await createDbRoles();
await migrate(migrationDb, migrateConfig);

console.info(pc.green('✓ Migrations complete'));
process.exit(0);
