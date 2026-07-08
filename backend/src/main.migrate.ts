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
  // Drizzle wraps the underlying pg/driver error as `cause`; its message holds
  // the real reason (TLS identity mismatch, auth failure, missing role, …),
  // which the top-level message omits. Surface it so a failed migrate on a
  // no-SSH VM is diagnosable from the serial console alone.
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause) {
    const causeMsg =
      cause instanceof Error ? `${cause.message}${cause.stack ? `\n${cause.stack}` : ''}` : String(cause);
    console.error(pc.red(`${timestamp()} [migrate]   cause: ${causeMsg}`));
  }
  // Also ship the failure to Maple; container stdout is not centrally collected,
  // so without this a failed production migration is invisible in the log backend.
  // The OTel transport batches with a 5s schedule; wait past it so the export
  // actually leaves before the one-shot container exits.
  const { baseLog } = await import('#/lib/pino');
  baseLog.fatal('Migration failed', { err: error });
  await new Promise((resolve) => setTimeout(resolve, 6000));
  process.exit(1);
}
