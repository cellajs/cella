import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pc from 'picocolors';
import { getAdminDb, migrateConfig } from '#/db/db';
import { createDbRoles } from './db/create-db-roles';
import { installJobsSchema } from './db/install-jobs-schema';
import { scheduleRetention } from './db/schedule-retention';

const migrationDb = getAdminDb('migrations');

await createDbRoles();
await migrate(migrationDb, migrateConfig);
await scheduleRetention();
await installJobsSchema();

console.info(pc.green('✓ Migrations complete'));
process.exit(0);
