import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrate } from 'drizzle-orm/pg-core';
import { syncBulkMarkerPrefix } from 'shared/utils/worker-env';
import { type DB, getAdminDb, migrateConfig } from '#/db/db';
import { createDbRoles } from './create-db-roles';

/**
 * Applies the pending migrations, each opening with the bulk marker: drizzle runs every pending one in one transaction,
 * and the CDC worker records none of that transaction's writes and rebuilds its books at the commit. A backfill of any
 * size passes, and clients see its rows by one refetch. The file hashes drizzle stores stay those of the files.
 * @param db - The admin connection: the migrations grant to the roles it owns.
 */
export async function runMigrations(db: DB): Promise<void> {
  const migrations = readMigrationFiles(migrateConfig).map((migration) => ({
    ...migration,
    sql: [`SELECT pg_logical_emit_message(true, '${syncBulkMarkerPrefix}', 'migrate:${migration.name}')`, ...migration.sql],
  }));
  await migrate(migrations, db, migrateConfig);
}

/**
 * Brings the database to this release: the roles the migrations grant to, the schema migrations, then the job store,
 * in that order. The migrate companion, `pnpm migrate` and the API's development boot all run this sequence, so a step
 * added here reaches each of them. Every step is idempotent.
 * @param purpose - Names the admin connection in the error thrown when `DATABASE_ADMIN_URL` is missing.
 * @param announce - Receives a line naming each step before it runs.
 */
export async function migrateDatabase(purpose: string, announce: (step: string) => void = () => {}): Promise<void> {
  const migrationDb = getAdminDb(purpose);

  announce('Ensuring DB roles...');
  await createDbRoles();

  announce('Running migrations...');
  await runMigrations(migrationDb);

  // The job store (pg-boss) is installed and upgraded here as the table owner; runtime processes never migrate it.
  // Its installer loads every module for the queues they declare: imported at this step, a module that fails to load
  // fails the step, inside the caller's error handling.
  announce('Installing job store...');
  const { installJobsSchema } = await import('./install-jobs-schema');
  await installJobsSchema();
}
