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

  // Seed the system administrator only for an empty user table; the lazy import keeps mock helpers out of this path.
  console.info(`${timestamp()} [migrate] Seeding system admin (idempotent)...`);
  const { initSeed } = await import('../scripts/seeds/00-init.seed');
  await initSeed();
  console.info(pc.green(`${timestamp()} [migrate] ✓ Admin seed complete`));

  process.exit(0);
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(pc.red(`${timestamp()} [migrate] ✗ Migrate companion failed: ${msg}`));
  // Surface wrapped driver errors so serial-only production failures retain TLS/auth detail.
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause) {
    const causeMsg =
      cause instanceof Error ? `${cause.message}${cause.stack ? `\n${cause.stack}` : ''}` : String(cause);
    console.error(pc.red(`${timestamp()} [migrate]   cause: ${causeMsg}`));
  }
  // Log to OTel because one-shot container output is not collected, then wait through the batch interval.
  const { baseLog } = await import('#/lib/pino');
  baseLog.fatal('Migrate companion failed', { err: error });
  await new Promise((resolve) => setTimeout(resolve, 6000));
  process.exit(1);
}
