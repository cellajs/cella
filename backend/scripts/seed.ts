import { execSync } from 'node:child_process';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { migrateConfig, migrationDb } from '#/db/db';
import { env } from '#/env';
import { setupRoles } from './db/setup-roles';

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

// Setup roles first (dev only, skipped if already exist)
await setupRoles();

// Migrate db using admin connection (applies RLS grants)
await migrate(migrationDb, migrateConfig);

import { seedScripts } from './scripts-config';

/**
 * Run seed scripts array from scripts-config
 */
for (const cmd of seedScripts) {
  try {
    // Execute the command
    execSync(cmd, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error executing command: ${cmd}`, error);
    process.exit(1);
  }
}
