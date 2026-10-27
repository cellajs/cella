import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getAdminDb, migrateConfig } from '#/db/db';
import { createDbRoles } from './create-db-roles';
import { scheduleRetention } from './schedule-retention';

/**
 * Brings the database to this release: the roles the migrations grant to, the schema migrations, the nightly retention
 * job in pg_cron, then the job store, in that order. The migrate companion, `pnpm migrate` and the API's development
 * boot all run this sequence, so a step added here reaches each of them. Every step is idempotent.
 * @param purpose - Names the admin connection in the error thrown when `DATABASE_ADMIN_URL` is missing.
 * @param announce - Receives a line naming each step before it runs.
 */
export async function migrateDatabase(purpose: string, announce: (step: string) => void = () => {}): Promise<void> {
  const migrationDb = getAdminDb(purpose);

  announce('Ensuring DB roles...');
  await createDbRoles();

  announce('Running migrations...');
  await migrate(migrationDb, migrateConfig);

  announce('Scheduling retention job...');
  await scheduleRetention();

  // The job store (pg-boss) is installed and upgraded here as the table owner; runtime processes never migrate it.
  // Its installer loads every module for the queues they declare: imported at this step, a module that fails to load
  // fails the step, inside the caller's error handling.
  announce('Installing job store...');
  const { installJobsSchema } = await import('./install-jobs-schema');
  await installJobsSchema();
}
