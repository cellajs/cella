/**
 * One-shot migration entrypoint (MODE=migrate).
 *
 * Applies pending drizzle migrations and ensures DB roles against the DB
 * pointed to by DATABASE_ADMIN_URL, then exits. This is the production path:
 * the reconciler runs this as a short-lived container BEFORE rolling the
 * serve-only API, so schema changes land while the old code is still serving
 * (expand-before-rollover). Exits non-zero on failure so the caller can gate.
 *
 * Shares its implementation intent with scripts/migrate.ts, but lives under
 * src/ so it is bundled into the single dist/main.js image entry and selected
 * via MODE — no extra build target or tsx in the runtime image.
 */

import process from 'node:process';
import { migrate as pgMigrate } from 'drizzle-orm/node-postgres/migrator';
import pc from 'picocolors';
import { migrateConfig, migrationDb } from '#/db/db';
import { timestamp } from '#/utils/console';
import { createDbRoles } from '../scripts/db/create-db-roles';

if (!migrationDb) {
  console.error(pc.red(`${timestamp()} [migrate] DATABASE_ADMIN_URL required for migrations`));
  process.exit(1);
}

try {
  console.info(`${timestamp()} [migrate] Ensuring DB roles...`);
  await createDbRoles();

  console.info(`${timestamp()} [migrate] Running migrations...`);
  await pgMigrate(migrationDb, migrateConfig);

  console.info(pc.green(`${timestamp()} [migrate] ✓ Migrations complete`));
  process.exit(0);
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(pc.red(`${timestamp()} [migrate] ✗ Migration failed: ${msg}`));
  process.exit(1);
}
