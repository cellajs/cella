import { execSync } from 'node:child_process';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { migrateConfig, migrationDb } from '#/db/db';
import { env } from '#/env';
import { appConfig } from 'shared';
import { createDbRoles } from './db/create-db-roles';

if (env.DEV_MODE === 'basic') {
  console.info(' ');
  console.info('Database seeding skipped: The database is automatically populated when QUICK mode starts.');
  console.info(' ');
  process.exit(0);
}

if (!migrationDb) {
  console.error('DATABASE_ADMIN_URL required for migrations');
  process.exit(1);
}

// Create db roles first
await createDbRoles();

// Migrate db using admin connection (applies RLS grants)
await migrate(migrationDb, migrateConfig);

import { seedAdminScripts, seedScripts } from './scripts-config';

const isProduction = appConfig.mode === 'production';

/**
 * In production only seed the admin user.
 * In development seed all data (users, organizations, data, counters).
 */
const scripts = isProduction ? seedAdminScripts : seedScripts;

for (const cmd of scripts) {
  try {
    // Execute the command
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing command: ${cmd}`, error);
    process.exit(1);
  }
}
