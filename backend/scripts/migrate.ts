import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pc from 'picocolors';
import { getAdminDb, migrateConfig } from '#/db/db';
import { createDbRoles } from './db/create-db-roles';

const migrationDb = getAdminDb('migrations');

await createDbRoles();
await migrate(migrationDb, migrateConfig);

console.info(pc.green('✓ Migrations complete'));
process.exit(0);
